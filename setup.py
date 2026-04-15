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
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires,
)
