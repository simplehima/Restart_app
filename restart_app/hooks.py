app_name = "restart_app"
app_title = "Restart App"
app_publisher = "Restart App"
app_description = "Schedule server restarts and notify active Desk users in real time."
app_email = "support@example.com"
app_license = "MIT"

app_include_css = "/assets/restart_app/css/restart_notifier.css?v=20260415f"
app_include_js = "/assets/restart_app/js/restart_notifier.js?v=20260415f"
web_include_css = "/assets/restart_app/css/restart_notifier.css?v=20260415f"
web_include_js = "/assets/restart_app/js/restart_notifier.js?v=20260415f"

scheduler_events = {
	"all": [
		"restart_app.tasks.process_pending_restart",
	],
}

extend_bootinfo = [
	"restart_app.boot.extend_bootinfo",
]
