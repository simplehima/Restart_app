# Restart App

Restart App is a Frappe app for scheduling controlled server restart windows with bilingual user notifications (English/Arabic), live countdown popups, execution progress tracking, and bench operation controls.

## Highlights

- Schedule restart by specific date/time or minutes from now
- Notify active users globally with countdown popup and warning tones
- Bilingual UI and notifications (English / Arabic)
- Bench operations mode with checkboxes (`clear-cache`, `migrate`, `build`, `restart`)
- Per-step restart execution logs (success/failure, command, output/error)
- Live execution progress and ETA for Bench Operations runs
- In-page restart control center at `/app/server-restart`
- App update utilities (check, pull, push) from the same page

## What Users See

- Global bilingual popup on all pages with countdown before restart
- Restart-in-progress state with progress percent and ETA
- Action-required reload state after restart
- Server restart console at `/app/server-restart` with:
  - scheduling controls
  - bench operations toggles
  - app update tools
  - execution logs table with step labels

## Production Restart Command Notes

If `supervisorctl` is not available in your bench shell (for example inside some Docker images), configure one of these in `site_config.json`:

- `restart_supervisor_command`: default restart command (used when no targets are provided)
- `restart_supervisor_target_command`: template command for targeted restarts, must include `{targets}`

Example:

```json
{
  "restart_supervisor_target_command": "docker exec backend supervisorctl restart {targets}"
}
```

### New Bench Setup (Recommended for production)

If you want the app to run `supervisorctl restart all` from scheduled jobs without prompting for a password, set up `sudoers` once.

1. Find supervisorctl path:

```bash
which supervisorctl
```

2. Create a dedicated sudoers rule (replace the path if different):

```bash
sudo visudo -f /etc/sudoers.d/99-frappe-supervisor
```

Add:

```sudoers
frappe ALL=(ALL:ALL) NOPASSWD: /usr/bin/supervisorctl restart all
```

Then set permissions:

```bash
sudo chmod 440 /etc/sudoers.d/99-frappe-supervisor
```

3. Verify non-interactive execution as `frappe` user:

```bash
sudo -n /usr/bin/supervisorctl restart all
echo $?
```

Expected result: exit code `0`.

4. Configure app command on the site:

```bash
bench --site <your-site> set-config restart_supervisor_command "sudo /usr/bin/supervisorctl restart all"
bench --site <your-site> clear-cache
bench restart
```

5. In Restart App UI (`/app/server-restart`) use:
   - Restart Action: `Bench Operations (checkboxes)`
   - Enable only: `Restart (Supervisor)`
   - Leave: `Supervisor Targets` empty (so the configured `restart_supervisor_command` is used)
   - Set `Bench Path` and `Bench Site` for your environment

If your policy does not allow `sudo`, see the non-sudo alternatives by configuring Supervisor socket permissions or using a different approved restart command.

## Installation

From your bench:

```bash
bench get-app https://github.com/simplehima/Restart_app
bench --site <your-site> install-app restart_app
bench --site <your-site> migrate
bench build --app restart_app
bench --site <your-site> clear-cache
bench restart
```

## Screenshots

### Server Restart Page

![Server Restart Page](docs/screenshots/server-restart-page.png)

### Bench Operations

![Bench Operations](docs/screenshots/bench-operations.png)

### Global Popup

![Global Popup](docs/screenshots/global-popup.png)

<img width="1891" height="904" alt="image" src="https://github.com/user-attachments/assets/8d3c6daa-5222-43aa-b88c-67b1adbb983f" />

## Suggested GitHub Topics (Tags)

Use these repository topics in GitHub:

- `frappe`
- `erpnext`
- `frappe-app`
- `maintenance`
- `scheduler`
- `restart`
- `realtime`
- `docker`
- `arabic`
- `bilingual`

## Repository

- Source: [https://github.com/simplehima/Restart_app](https://github.com/simplehima/Restart_app)
- Issues: [https://github.com/simplehima/Restart_app/issues](https://github.com/simplehima/Restart_app/issues)
