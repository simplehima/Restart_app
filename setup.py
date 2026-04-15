from setuptools import find_packages, setup

install_requires = []
try:
	with open("requirements.txt") as f:
		install_requires = [line.strip() for line in f if line.strip() and not line.startswith("#")]
except OSError:
	pass

setup(
	name="restart_app",
	version="0.1.0",
	description="Server restart scheduler and realtime user notifications for Frappe v15",
	long_description="Restart App provides scheduled restart workflows, user countdown notifications, and bench operations controls for Frappe/ERPNext environments.",
	keywords="frappe, erpnext, maintenance, scheduler, restart, devops, docker",
	project_urls={
		"Source": "https://github.com/simplehima/Restart_app",
		"Issues": "https://github.com/simplehima/Restart_app/issues",
	},
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires,
)
