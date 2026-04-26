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
	_ensure_scheduler_in_boot_can_read(bootinfo)

	try:
		doc = frappe.get_single(_DT)
	except Exception:
		doc = None

	if doc and doc.status == "Pending" and doc.scheduled_at:
		bootinfo["server_restart_pending"] = {
			"scheduled_at_utc": scheduled_datetime_to_utc_iso_z(doc.scheduled_at),
		}
