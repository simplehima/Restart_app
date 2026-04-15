# Copyright (c) 2026, Restart App and contributors
# For license information, please see license.txt

from datetime import datetime, timezone as dt_timezone
from zoneinfo import ZoneInfo

from frappe.utils import get_system_timezone
from frappe.utils.data import get_datetime


def scheduled_datetime_to_utc_iso_z(dttm: datetime | str | None) -> str | None:
	"""Encode stored (naive, system-local) datetimes for JavaScript as UTC Zulu ISO."""
	if not dttm:
		return None

	if isinstance(dttm, str):
		dttm = get_datetime(dttm)

	tzname = get_system_timezone()
	local = dttm.replace(tzinfo=ZoneInfo(tzname))
	return local.astimezone(dt_timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
