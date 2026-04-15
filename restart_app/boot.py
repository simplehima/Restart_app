# Copyright (c) 2026, Restart App and contributors
# For license information, please see license.txt

import frappe

from restart_app.utils import scheduled_datetime_to_utc_iso_z

_DT = "Server Restart Scheduler"


def _ensure_scheduler_in_boot_can_read(bootinfo):
	"""Desk router only registers slugs for doctypes in boot.user.can_read (see frappe/router.js)."""
	if frappe.session.user in ("", "Guest", None):
		return
	if not frappe.db.exists("DocType", _DT):
		return
	user = frappe.session.user
	if user != "Administrator" and "System Manager" not in frappe.get_roles(user):
		return
	u = bootinfo.get("user")
	if not u:
		return
	cr = u.get("can_read")
	if cr is None:
		return
	if not isinstance(cr, list):
		cr = list(cr)
		u["can_read"] = cr
	if _DT not in cr:
		cr.append(_DT)


def extend_bootinfo(bootinfo):
	u0 = bootinfo.get("user") or {}
	_cr0 = u0.get("can_read")
	_can_read_type_before = type(_cr0).__name__ if _cr0 is not None else "None"

	_ensure_scheduler_in_boot_can_read(bootinfo)

	try:
		doc = frappe.get_single(_DT)
	except Exception:
		doc = None

	if doc and doc.status == "Pending" and doc.scheduled_at:
		bootinfo["server_restart_pending"] = {
			"scheduled_at_utc": scheduled_datetime_to_utc_iso_z(doc.scheduled_at),
		}

	# #region agent log
	try:
		import json as _agent_json
		import time as _agent_time

		_path = frappe.get_site_path("restart_app_debug_4d846e.ndjson")
		_uid = frappe.session.user
		_has_row = bool(frappe.db.exists("DocType", _DT))
		_can_read_perm = None
		if _has_row:
			_can_read_perm = bool(frappe.has_permission(_DT, ptype="read", user=_uid))
		_roles = list(frappe.get_roles(_uid))
		_installed = list(frappe.get_installed_apps())
		_cr = (bootinfo.get("user") or {}).get("can_read") or []
		_in_can_read_boot = _DT in _cr
		_line = (
			_agent_json.dumps(
				{
					"sessionId": "4d846e",
					"hypothesisId": "H1-verify",
					"location": "boot.py:extend_bootinfo",
					"message": "server_probe_post_patch",
					"runId": "post-fix",
					"data": {
						"user": _uid,
						"docTypeRowExists": _has_row,
						"hasReadPermission": _can_read_perm,
						"roles": _roles,
						"inBootCanRead": _in_can_read_boot,
						"restart_app_installed": "restart_app" in _installed,
						"canReadTypeBeforeEnsure": _can_read_type_before,
						"canReadTypeAfterEnsure": type(_cr).__name__,
					},
					"timestamp": int(_agent_time.time() * 1000),
				}
			)
			+ "\n"
		)
		with open(_path, "a", encoding="utf-8") as _f:
			_f.write(_line)
		try:
			from pathlib import Path as _Path

			_repo_log = _Path(__file__).resolve().parent.parent / "debug-4d846e.log"
			with open(_repo_log, "a", encoding="utf-8") as _f2:
				_f2.write(_line)
		except Exception:
			pass
	except Exception as _ex:
		try:
			import json as _agent_json2

			with open(
				frappe.get_site_path("restart_app_debug_4d846e.ndjson"),
				"a",
				encoding="utf-8",
			) as _f:
				_f.write(
					_agent_json2.dumps(
						{
							"sessionId": "4d846e",
							"hypothesisId": "H1-verify",
							"location": "boot.py:extend_bootinfo",
							"message": "server_probe_error",
							"data": {"error": str(_ex)},
						}
					)
					+ "\n"
				)
		except Exception:
			pass
	# #endregion
