# Copyright (c) 2026, Restart App and contributors
# For license information, please see license.txt

from datetime import timedelta
from pathlib import Path
import subprocess

import frappe
from frappe import _

from frappe.utils.data import get_datetime, now_datetime

from restart_app.utils import scheduled_datetime_to_utc_iso_z


def ensure_restart_scheduler_permission():
	if frappe.session.user == "Administrator":
		return
	roles = frappe.get_roles(frappe.session.user)
	if "System Manager" in roles:
		return
	raise frappe.exceptions.PermissionError(_("Not permitted to manage server restart scheduling."))


def _scheduler_doc():
	return frappe.get_single("Server Restart Scheduler")


def _max_horizon_days():
	return int(frappe.conf.get("restart_scheduler_max_days") or 7)


def _repo_root():
	return Path(__file__).resolve().parent.parent


def _run_git(args):
	repo = str(_repo_root())
	proc = subprocess.run(
		["git", "-c", f"safe.directory={repo}", *args],
		cwd=repo,
		capture_output=True,
		text=True,
		check=False,
	)
	return proc.returncode, (proc.stdout or "").strip(), (proc.stderr or "").strip()


def _normalize_scheduled_at(scheduled_at, minutes_from_now):
	if minutes_from_now is not None and str(minutes_from_now).strip() != "":
		m = int(minutes_from_now)
		if m <= 0:
			frappe.throw(_("Minutes from now must be a positive integer."))
		return now_datetime() + timedelta(minutes=m)

	if not scheduled_at:
		frappe.throw(_("Provide scheduled_at or minutes_from_now."))

	return get_datetime(scheduled_at)


def _bench_total_steps(doc):
	total_steps = 0
	if int(doc.bench_op_clear_cache or 0):
		total_steps += 1
	if int(doc.bench_op_migrate or 0):
		total_steps += 1
	if int(doc.bench_op_build or 0):
		apps = [a.strip() for a in str(doc.bench_build_apps or "").split(",") if a.strip()]
		total_steps += len(apps) if apps else 1
	if int(doc.bench_op_restart or 0):
		total_steps += 1
	return max(total_steps, 1)


def _progress_for_doc(doc):
	if doc.status != "Pending" or not doc.scheduled_at:
		return {
			"in_progress": False,
			"total_steps": 0,
			"completed_steps": 0,
			"failed_steps": 0,
			"percent": 0,
			"eta_seconds": None,
			"message": _("No active restart workflow."),
		}

	action = str(doc.restart_action or "Restart Command")
	if action != "Bench Operations (checkboxes)":
		return {
			"in_progress": True,
			"total_steps": 1,
			"completed_steps": 0,
			"failed_steps": 0,
			"percent": 5,
			"eta_seconds": None,
			"message": _("Command is running."),
		}

	total_steps = _bench_total_steps(doc)
	rows = frappe.get_all(
		"Server Restart Log",
		filters={"scheduled_at": doc.scheduled_at, "plan_mode": ["like", "sequence-step-%"]},
		fields=["status", "started_at", "completed_at"],
		order_by="creation asc",
		limit_page_length=500,
	)
	completed_steps = len([r for r in rows if r.status == "Success"])
	failed_steps = len([r for r in rows if r.status == "Failed"])
	done_steps = completed_steps + failed_steps
	step_percent = int((done_steps / total_steps) * 100) if total_steps > 0 else 0

	remaining_steps = max(0, total_steps - done_steps)
	durations = []
	for r in rows:
		if r.started_at and r.completed_at:
			sec = (get_datetime(r.completed_at) - get_datetime(r.started_at)).total_seconds()
			if sec > 0:
				durations.append(sec)
	avg_step_seconds = (sum(durations) / len(durations)) if durations else 35.0

	# Time-based estimate keeps progress moving during long-running steps.
	scheduled_at_dt = get_datetime(doc.scheduled_at)
	elapsed = max(0.0, (now_datetime() - scheduled_at_dt).total_seconds())
	expected_total_seconds = max(30.0, avg_step_seconds * total_steps)
	time_percent = int(min(95, (elapsed / expected_total_seconds) * 100)) if done_steps < total_steps else 100
	percent = max(step_percent, time_percent)
	if done_steps >= total_steps:
		percent = 100

	eta_seconds = int(max(5, expected_total_seconds - elapsed)) if done_steps < total_steps else 0

	current_step = min(done_steps + 1, total_steps) if done_steps < total_steps else total_steps
	message = _("Step {0} of {1} in progress.").format(current_step, total_steps)
	if failed_steps:
		message = _("One or more steps failed. Check logs.")
	elif done_steps >= total_steps:
		message = _("All steps completed. Waiting for final status update.")

	return {
		"in_progress": True,
		"total_steps": total_steps,
		"completed_steps": completed_steps,
		"failed_steps": failed_steps,
		"percent": percent,
		"eta_seconds": eta_seconds,
		"message": message,
	}


@frappe.whitelist()
def schedule_restart(
	scheduled_at=None,
	minutes_from_now=None,
	restart_action=None,
	restart_command=None,
	restart_sites_command=None,
	bench_path=None,
	bench_site=None,
	bench_supervisor_targets=None,
	bench_op_clear_cache=None,
	bench_op_migrate=None,
	bench_op_build=None,
	bench_op_restart=None,
	bench_build_apps=None,
):
	ensure_restart_scheduler_permission()

	target = _normalize_scheduled_at(scheduled_at, minutes_from_now)
	now = now_datetime()

	if target <= now:
		frappe.throw(_("Scheduled time must be in the future."))

	max_delta = timedelta(days=_max_horizon_days())
	if target - now > max_delta:
		frappe.throw(_("Scheduled time is too far in the future."), title=_("Limit exceeded"))

	doc = _scheduler_doc()
	if restart_action is not None and str(restart_action).strip():
		doc.restart_action = str(restart_action).strip()
	if restart_command is not None:
		doc.restart_command = str(restart_command or "").strip() or None
	if restart_sites_command is not None:
		doc.restart_sites_command = str(restart_sites_command or "").strip() or None
	if bench_path is not None:
		doc.bench_path = str(bench_path or "").strip() or None
	if bench_site is not None:
		doc.bench_site = str(bench_site or "").strip() or None
	if bench_supervisor_targets is not None:
		doc.bench_supervisor_targets = str(bench_supervisor_targets or "").strip() or None
	if bench_op_clear_cache is not None:
		doc.bench_op_clear_cache = int(str(bench_op_clear_cache).strip() in {"1", "true", "True"})
	if bench_op_migrate is not None:
		doc.bench_op_migrate = int(str(bench_op_migrate).strip() in {"1", "true", "True"})
	if bench_op_build is not None:
		doc.bench_op_build = int(str(bench_op_build).strip() in {"1", "true", "True"})
	if bench_op_restart is not None:
		doc.bench_op_restart = int(str(bench_op_restart).strip() in {"1", "true", "True"})
	if bench_build_apps is not None:
		doc.bench_build_apps = str(bench_build_apps or "").strip() or None
	doc.scheduled_at = target
	doc.status = "Pending"
	doc.minutes_from_now = None
	doc.last_error = None
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	message = {
		"scheduled_at_utc": scheduled_datetime_to_utc_iso_z(doc.scheduled_at),
	}

	frappe.publish_realtime(
		event="server_restart_scheduled",
		message=message,
		room="all",
	)

	return {"ok": True}


@frappe.whitelist()
def cancel_pending_restart():
	ensure_restart_scheduler_permission()
	doc = _scheduler_doc()
	if doc.status != "Pending":
		return {"ok": True, "changed": False}

	doc.status = "Idle"
	doc.scheduled_at = None
	doc.minutes_from_now = None
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	frappe.publish_realtime(
		event="server_restart_cancelled",
		message={},
		room="all",
	)

	return {"ok": True, "changed": True}


@frappe.whitelist()
def get_restart_status():
	if frappe.session.user in ("Guest", "", None):
		return {
			"ok": True,
			"status": "Idle",
			"scheduled_at": None,
			"scheduled_at_utc": None,
			"last_error": "",
		}

	try:
		row = frappe.db.get_value(
			"Server Restart Scheduler",
			"Server Restart Scheduler",
			[
				"status",
				"scheduled_at",
				"last_error",
				"restart_action",
				"restart_command",
				"restart_sites_command",
				"bench_path",
				"bench_site",
				"bench_supervisor_targets",
				"bench_op_clear_cache",
				"bench_op_migrate",
				"bench_op_build",
				"bench_op_restart",
				"bench_build_apps",
			],
			as_dict=True,
		)
	except Exception:
		return {
			"ok": True,
			"status": "Idle",
			"scheduled_at": None,
			"scheduled_at_utc": None,
			"last_error": "",
		}

	if not row:
		return {
			"ok": True,
			"status": "Idle",
			"scheduled_at": None,
			"scheduled_at_utc": None,
			"last_error": "",
		}

	progress = _progress_for_doc(row)
	return {
		"ok": True,
		"status": row.status,
		"scheduled_at": str(row.scheduled_at) if row.scheduled_at else None,
		"scheduled_at_utc": scheduled_datetime_to_utc_iso_z(row.scheduled_at),
		"last_error": row.last_error or "",
		"restart_action": row.restart_action or "Restart Command",
		"restart_command": row.restart_command or "",
		"restart_sites_command": row.restart_sites_command or "",
		"bench_path": row.bench_path or "",
		"bench_site": row.bench_site or "",
		"bench_supervisor_targets": row.bench_supervisor_targets or "",
		"bench_op_clear_cache": int(row.bench_op_clear_cache or 0),
		"bench_op_migrate": int(row.bench_op_migrate or 0),
		"bench_op_build": int(row.bench_op_build or 0),
		"bench_op_restart": int(row.bench_op_restart or 0),
		"bench_build_apps": row.bench_build_apps or "",
		"progress": progress,
	}


@frappe.whitelist()
def get_app_update_status(remote="origin", branch="main"):
	ensure_restart_scheduler_permission()
	remote = (remote or "origin").strip()
	branch = (branch or "main").strip()

	rc, head_sha, err = _run_git(["rev-parse", "HEAD"])
	if rc != 0:
		frappe.throw(_("Unable to read repository HEAD: {0}").format(err or "git rev-parse failed"))

	_run_git(["fetch", remote, branch, "--quiet"])

	rc, local_branch, err = _run_git(["rev-parse", "--abbrev-ref", "HEAD"])
	if rc != 0:
		local_branch = "unknown"

	rc, counts, rev_list_err = _run_git(["rev-list", "--left-right", "--count", f"HEAD...{remote}/{branch}"])
	ahead = 0
	behind = 0
	if rc == 0 and counts:
		parts = counts.split()
		if len(parts) >= 2:
			ahead = int(parts[0] or 0)
			behind = int(parts[1] or 0)

	rc, status_lines, status_err = _run_git(["status", "--porcelain"])
	dirty = bool(status_lines.strip()) if rc == 0 else False

	return {
		"ok": True,
		"remote": remote,
		"branch": branch,
		"local_branch": local_branch,
		"head_sha": head_sha,
		"ahead": ahead,
		"behind": behind,
		"dirty": dirty,
		"can_pull": behind > 0 and not dirty,
		"can_push": ahead > 0 and not dirty,
	}


@frappe.whitelist()
def pull_app_updates(remote="origin", branch="main"):
	ensure_restart_scheduler_permission()
	status = get_app_update_status(remote=remote, branch=branch)
	if status.get("dirty"):
		frappe.throw(_("Working tree has uncommitted changes. Commit or stash before pulling."))
	if status.get("behind", 0) <= 0:
		return {"ok": True, "changed": False, "message": _("Already up to date.")}

	rc, out, err = _run_git(["pull", status["remote"], status["branch"]])
	if rc != 0:
		frappe.throw(_("Git pull failed: {0}").format(err or out or "unknown error"))
	return {"ok": True, "changed": True, "output": out}


@frappe.whitelist()
def push_app_updates(remote="origin", branch="main"):
	ensure_restart_scheduler_permission()
	status = get_app_update_status(remote=remote, branch=branch)
	if status.get("dirty"):
		frappe.throw(_("Working tree has uncommitted changes. Commit before pushing."))
	if status.get("ahead", 0) <= 0:
		return {"ok": True, "changed": False, "message": _("No local commits to push.")}

	rc, out, err = _run_git(["push", status["remote"], f"HEAD:{status['branch']}"])
	if rc != 0:
		frappe.throw(_("Git push failed: {0}").format(err or out or "unknown error"))
	return {"ok": True, "changed": True, "output": out}


@frappe.whitelist()
def get_restart_logs(limit=20, offset=0):
	ensure_restart_scheduler_permission()
	limit = max(1, min(int(limit or 20), 200))
	offset = max(0, int(offset or 0))
	total = frappe.db.count("Server Restart Log")
	rows = frappe.get_all(
		"Server Restart Log",
		fields=[
			"name",
			"scheduled_at",
			"started_at",
			"completed_at",
			"status",
			"restart_action",
			"plan_mode",
			"executed_command",
			"output_log",
			"error_log",
			"creation",
		],
		order_by="creation desc",
		limit_page_length=limit,
		limit_start=offset,
	)
	return {
		"ok": True,
		"logs": rows,
		"total": int(total or 0),
		"offset": offset,
		"limit": limit,
		"has_more": (offset + len(rows)) < int(total or 0),
	}


@frappe.whitelist()
def get_current_restart_progress():
	ensure_restart_scheduler_permission()
	doc = _scheduler_doc()
	progress = _progress_for_doc(doc)
	progress["ok"] = True
	progress["status"] = doc.status
	return progress


