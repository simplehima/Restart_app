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
	parts = shlex.split(command, posix=os.name != "nt")
	if not parts:
		raise ValueError("empty command")
	subprocess.Popen(
		parts,
		stdin=subprocess.DEVNULL,
		stdout=subprocess.DEVNULL,
		stderr=subprocess.DEVNULL,
		close_fds=os.name != "nt",
	)


def _run_sequence_commands(commands: list[str]):
	for cmd in commands:
		subprocess.run(
			cmd,
			shell=True,
			check=True,
			stdin=subprocess.DEVNULL,
			stdout=subprocess.DEVNULL,
			stderr=subprocess.DEVNULL,
		)


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
		if plan["mode"] == "sequence":
			_run_sequence_commands(plan["commands"])
		else:
			_run_restart_command(plan["command"])
		try:
			doc.status = "Completed"
			doc.last_error = None
			doc.save(ignore_permissions=True)
			frappe.db.commit()
		except Exception:
			frappe.db.commit()
	except Exception as exc:
		doc.status = "Failed"
		doc.last_error = frappe.get_traceback() if frappe.conf.developer_mode else str(exc)
		doc.save(ignore_permissions=True)
		frappe.db.commit()
