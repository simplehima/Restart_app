# Copyright (c) 2026, Restart App and contributors
# For license information, please see license.txt

import os
import shlex
import subprocess

import frappe
from frappe.utils.data import get_datetime, now_datetime


def _docker_bench_restart_command() -> str | None:
	"""Build a safe default for local Docker-based benches."""
	use_docker_default = frappe.conf.get("restart_use_docker_bench")
	container_name = frappe.conf.get("restart_docker_container")

	if not use_docker_default and not container_name:
		return None

	container = str(container_name or "backend").strip()
	if not container:
		container = "backend"

	return f'docker exec {shlex.quote(container)} bash -lc "bench restart"'


def _truthy(v) -> bool:
	return str(v or "").strip().lower() in {"1", "true", "yes", "on"}


def _bench_operations_commands(doc) -> list[str]:
	bench_path = str(getattr(doc, "bench_path", "") or frappe.conf.get("restart_bench_path") or "/home/frappe/frappe-bench").strip()
	site = str(getattr(doc, "bench_site", "") or frappe.local.site or "").strip()
	if not site:
		return []

	commands: list[str] = []
	base = f"cd {shlex.quote(bench_path)}"

	if _truthy(getattr(doc, "bench_op_clear_cache", 0)):
		commands.append(f"{base} && bench --site {shlex.quote(site)} clear-cache")
	if _truthy(getattr(doc, "bench_op_migrate", 0)):
		commands.append(f"{base} && bench --site {shlex.quote(site)} migrate")
	if _truthy(getattr(doc, "bench_op_build", 0)):
		raw_apps = str(getattr(doc, "bench_build_apps", "") or frappe.conf.get("restart_bench_build_apps") or "restart_app")
		apps = [a.strip() for a in raw_apps.split(",") if a.strip()]
		for app in apps:
			commands.append(f"{base} && bench build --app {shlex.quote(app)}")
	if _truthy(getattr(doc, "bench_op_restart", 0)):
		restart_cmd = str(frappe.conf.get("restart_supervisor_command") or "bench restart").strip()
		commands.append(f"{base} && {restart_cmd}")

	return commands


def _resolve_restart_plan(doc) -> dict | None:
	action = str(getattr(doc, "restart_action", "") or "Restart Command").strip()

	if action == "Run restart_sites.py command":
		doc_cmd = str(getattr(doc, "restart_sites_command", "") or "").strip()
		if doc_cmd:
			return {"mode": "single", "command": doc_cmd}
		conf_cmd = frappe.conf.get("restart_sites_command")
		if conf_cmd and str(conf_cmd).strip():
			return {"mode": "single", "command": str(conf_cmd).strip()}
		return None

	if action == "Bench Operations (checkboxes)":
		cmds = _bench_operations_commands(doc)
		if cmds:
			return {"mode": "sequence", "commands": cmds}
		return None

	if doc.restart_command and str(doc.restart_command).strip():
		return {"mode": "single", "command": str(doc.restart_command).strip()}

	conf = frappe.conf.get("restart_command")
	if conf and str(conf).strip():
		return {"mode": "single", "command": str(conf).strip()}

	default_cmd = _docker_bench_restart_command()
	if default_cmd:
		return {"mode": "single", "command": default_cmd}
	return None


def _run_restart_command(command: str):
	command = str(command or "").strip()
	if not command:
		raise ValueError("empty command")
	run = subprocess.run(
		command,
		shell=True,
		check=True,
		stdin=subprocess.DEVNULL,
		capture_output=True,
		text=True,
	)
	return {"stdout": (run.stdout or "").strip(), "stderr": (run.stderr or "").strip()}


def _run_sequence_commands(commands: list[str]):
	steps = []
	for idx, cmd in enumerate(commands, start=1):
		started_at = now_datetime()
		run = subprocess.run(
			cmd,
			shell=True,
			check=False,
			stdin=subprocess.DEVNULL,
			capture_output=True,
			text=True,
		)
		completed_at = now_datetime()
		step = {
			"index": idx,
			"command": cmd,
			"returncode": int(run.returncode),
			"stdout": (run.stdout or "").strip(),
			"stderr": (run.stderr or "").strip(),
			"started_at": started_at,
			"completed_at": completed_at,
		}
		steps.append(step)
		if run.returncode != 0:
			break
	return steps


def _write_restart_log(doc, success: bool, started_at, completed_at, details: dict, error_text: str | None = None):
	frappe.get_doc(
		{
			"doctype": "Server Restart Log",
			"scheduled_at": doc.scheduled_at,
			"started_at": started_at,
			"completed_at": completed_at,
			"status": "Success" if success else "Failed",
			"restart_action": getattr(doc, "restart_action", None) or "Restart Command",
			"plan_mode": details.get("plan_mode"),
			"executed_command": details.get("executed_command"),
			"output_log": (details.get("output_log") or "")[:65535],
			"error_log": (error_text or details.get("error_log") or "")[:65535],
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()


def process_pending_restart():
	"""Called from scheduler `all` tick (~every 60s)."""
	if frappe.flags.in_install or frappe.flags.in_migrate:
		return

	try:
		doc = frappe.get_single("Server Restart Scheduler")
	except Exception:
		return

	if doc.status != "Pending" or not doc.scheduled_at:
		return

	scheduled_at = get_datetime(doc.scheduled_at)
	if now_datetime() < scheduled_at:
		return

	plan = _resolve_restart_plan(doc)
	if not plan:
		doc.status = "Failed"
		doc.last_error = (
			"No command configured for selected action. "
			"For 'Restart Command', set restart_command or Docker defaults. "
			"For 'Run restart_sites.py command', set restart_sites_command "
			"(DocType or site_config). "
			"For 'Bench Operations (checkboxes)', enable at least one operation."
		)
		doc.save(ignore_permissions=True)
		frappe.db.commit()
		return

	try:
		started_at = now_datetime()
		details = {"plan_mode": plan["mode"], "executed_command": "", "output_log": "", "error_log": ""}
		if plan["mode"] == "sequence":
			details["executed_command"] = "\n".join(plan["commands"])
			steps = _run_sequence_commands(plan["commands"])
			if not steps:
				raise RuntimeError("No bench operation steps executed.")
			for step in steps:
				step_ok = step["returncode"] == 0
				step_details = {
					"plan_mode": f"sequence-step-{step['index']}",
					"executed_command": step["command"],
					"output_log": step["stdout"],
					"error_log": step["stderr"],
				}
				_write_restart_log(doc, step_ok, step["started_at"], step["completed_at"], step_details)
			failed = next((s for s in steps if s["returncode"] != 0), None)
			if failed:
				raise RuntimeError(
					f"Step {failed['index']} failed with exit code {failed['returncode']}: {failed['command']}\n{failed['stderr']}"
				)
			details["output_log"] = "\n\n".join([s["stdout"] for s in steps if s["stdout"]])
			details["error_log"] = "\n\n".join([s["stderr"] for s in steps if s["stderr"]])
		else:
			details["executed_command"] = plan["command"]
			res = _run_restart_command(plan["command"])
			details["output_log"] = res.get("stdout") or ""
			details["error_log"] = res.get("stderr") or ""
		try:
			doc.status = "Completed"
			doc.last_error = None
			doc.save(ignore_permissions=True)
			frappe.db.commit()
			completed_at = now_datetime()
			_write_restart_log(doc, True, started_at, completed_at, details)
		except Exception:
			frappe.db.commit()
	except Exception as exc:
		completed_at = now_datetime()
		error_text = frappe.get_traceback() if frappe.conf.developer_mode else str(exc)
		details = {
			"plan_mode": plan["mode"],
			"executed_command": "\n".join(plan["commands"]) if plan["mode"] == "sequence" else plan["command"],
		}
		_write_restart_log(doc, False, started_at if "started_at" in locals() else completed_at, completed_at, details, error_text=error_text)
		doc.status = "Failed"
		doc.last_error = error_text
		doc.save(ignore_permissions=True)
		frappe.db.commit()
