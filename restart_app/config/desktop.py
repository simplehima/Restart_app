def get_data():
	from frappe import _

	return [
		{
			"module_name": "Restart App",
			"type": "module",
			"label": _("Restart App"),
			"color": "#757575",
			"icon": "octicon octicon-sync",
		}
	]
