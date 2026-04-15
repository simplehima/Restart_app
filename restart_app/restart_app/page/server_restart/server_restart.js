frappe.pages["server-restart"].on_page_load = function (wrapper) {
	const bi = (en, ar) => `${__(en)} / ${ar}`;
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: bi("Server Restart", "إعادة تشغيل الخادم"),
		single_column: true,
	});

	$(page.body).html(`
		<div class="server-restart-page">
			<div class="server-restart-page__card">
				<div class="server-restart-page__eyebrow">${bi("Restart App", "تطبيق إعادة التشغيل")}</div>
				<h3 class="server-restart-page__title">${bi("Schedule and notify users before maintenance", "جدولة وإشعار المستخدمين قبل الصيانة")}</h3>
				<p class="server-restart-page__desc">
					${bi(
						"Set a restart time, notify active users with a live countdown, and execute your configured restart command."
						,
						"حدد وقت إعادة التشغيل، وأشعر المستخدمين النشطين بعداد تنازلي مباشر، ونفذ أمر إعادة التشغيل المهيأ."
					)}
				</p>
				<div class="server-restart-page__form">
					<div class="server-restart-page__field">
						<label>${bi("Minutes From Now", "دقائق من الآن")}</label>
						<input type="number" min="1" class="form-control server-restart-page__minutes" placeholder="${bi("e.g. 10", "مثال: 10")}">
					</div>
					<div class="server-restart-page__field">
						<label>${bi("Or Scheduled At", "أو مجدول في")}</label>
						<input type="datetime-local" class="form-control server-restart-page__datetime">
					</div>
					<div class="server-restart-page__field">
						<label>${bi("Restart Action", "إجراء إعادة التشغيل")}</label>
						<select class="form-control server-restart-page__action">
							<option value="Restart Command">${bi("Restart Command", "أمر إعادة التشغيل")}</option>
							<option value="Run restart_sites.py command">${bi("Run restart_sites.py command", "تشغيل أمر restart_sites.py")}</option>
							<option value="Bench Operations (checkboxes)">${bi("Bench Operations (checkboxes)", "عمليات Bench (مربعات اختيار)")}</option>
						</select>
					</div>
					<div class="server-restart-page__field server-restart-page__field--wide">
						<label>${bi("Restart Command", "أمر إعادة التشغيل")}</label>
						<textarea class="form-control server-restart-page__command" rows="2" placeholder="${bi("Optional: override restart command", "اختياري: تجاوز أمر إعادة التشغيل")}"></textarea>
					</div>
					<div class="server-restart-page__ops server-restart-page__field--wide" hidden>
						<div class="server-restart-page__field">
							<label>${bi("Bench Path", "مسار Bench")}</label>
							<input type="text" class="form-control server-restart-page__bench-path" placeholder="/home/frappe/frappe-bench">
						</div>
						<div class="server-restart-page__field">
							<label>${bi("Bench Site", "موقع Bench")}</label>
							<input type="text" class="form-control server-restart-page__bench-site" placeholder="dev.local">
						</div>
						<div class="server-restart-page__checks">
							<label><input type="checkbox" class="server-restart-page__op-clear-cache"> ${bi("Clear Cache", "تفريغ الكاش")}</label>
							<label><input type="checkbox" class="server-restart-page__op-migrate"> ${bi("Migrate", "ترحيل")}</label>
							<label><input type="checkbox" class="server-restart-page__op-build"> ${bi("Build App(s)", "بناء التطبيق/ات")}</label>
							<label><input type="checkbox" class="server-restart-page__op-restart"> ${bi("Restart (Supervisor)", "إعادة تشغيل (Supervisor)")}</label>
						</div>
						<div class="server-restart-page__field">
							<label>${bi("Apps To Build", "التطبيقات للبناء")}</label>
							<input type="text" class="form-control server-restart-page__build-apps" placeholder="restart_app,erpnext">
						</div>
					</div>
				</div>
				<div class="server-restart-page__status"></div>
				<div class="server-restart-page__progress" hidden>
					<div class="server-restart-page__progress-head">
						<span class="server-restart-page__progress-title">${bi("Execution Progress", "تقدم التنفيذ")}</span>
						<span class="server-restart-page__progress-pct">0%</span>
					</div>
					<div class="server-restart-page__progress-bar"><span class="server-restart-page__progress-fill"></span></div>
					<div class="server-restart-page__progress-msg">${bi("Waiting...", "بانتظار...")}</div>
				</div>
				<div class="server-restart-page__git">
					<div class="server-restart-page__git-title">${bi("App Updates", "تحديثات التطبيق")}</div>
					<div class="server-restart-page__git-controls">
						<input type="text" class="form-control server-restart-page__git-remote" value="origin" placeholder="origin">
						<input type="text" class="form-control server-restart-page__git-branch" value="main" placeholder="main">
						<button class="btn btn-default btn-sm server-restart-page__git-check">${bi("Check Updates", "فحص التحديثات")}</button>
						<button class="btn btn-default btn-sm server-restart-page__git-pull">${bi("Pull Updates", "سحب التحديثات")}</button>
						<button class="btn btn-default btn-sm server-restart-page__git-push">${bi("Push Updates", "دفع التحديثات")}</button>
					</div>
					<div class="server-restart-page__git-status">${bi("Update status not checked yet.", "لم يتم فحص حالة التحديث بعد.")}</div>
				</div>
				<div class="server-restart-page__logs">
					<div class="server-restart-page__logs-head">
						<div class="server-restart-page__logs-title">${bi("Restart Execution Logs", "سجل تنفيذ إعادة التشغيل")}</div>
						<button class="btn btn-default btn-sm server-restart-page__logs-refresh">${bi("Refresh Logs", "تحديث السجل")}</button>
					</div>
					<div class="server-restart-page__logs-table-wrap">
						<table class="server-restart-page__logs-table">
							<thead>
								<tr>
									<th>${bi("When", "متى")}</th>
									<th>${bi("Status", "الحالة")}</th>
									<th>${bi("Action", "الإجراء")}</th>
									<th>${bi("Step", "الخطوة")}</th>
									<th>${bi("Mode", "الوضع")}</th>
									<th>${bi("Command", "الأمر")}</th>
									<th>${bi("Details", "التفاصيل")}</th>
								</tr>
							</thead>
							<tbody class="server-restart-page__logs-body">
								<tr><td colspan="7">${bi("No logs yet.", "لا توجد سجلات حتى الآن.")}</td></tr>
							</tbody>
						</table>
					</div>
				</div>
				<div class="server-restart-page__actions">
					<button class="btn btn-primary btn-sm server-restart-page__schedule">
						${bi("Schedule & Notify", "جدولة وإشعار")}
					</button>
					<button class="btn btn-default btn-sm server-restart-page__cancel">
						${bi("Cancel Pending", "إلغاء المعلق")}
					</button>
					<button class="btn btn-default btn-sm server-restart-page__open">
						${bi("Open Doc", "فتح المستند")}
					</button>
				</div>
			</div>
		</div>
	`);

	const $root = $(page.body);
	const $minutes = $root.find(".server-restart-page__minutes");
	const $datetime = $root.find(".server-restart-page__datetime");
	const $action = $root.find(".server-restart-page__action");
	const $command = $root.find(".server-restart-page__command");
	const $ops = $root.find(".server-restart-page__ops");
	const $benchPath = $root.find(".server-restart-page__bench-path");
	const $benchSite = $root.find(".server-restart-page__bench-site");
	const $opClearCache = $root.find(".server-restart-page__op-clear-cache");
	const $opMigrate = $root.find(".server-restart-page__op-migrate");
	const $opBuild = $root.find(".server-restart-page__op-build");
	const $opRestart = $root.find(".server-restart-page__op-restart");
	const $buildApps = $root.find(".server-restart-page__build-apps");
	const $status = $root.find(".server-restart-page__status");
	const $gitRemote = $root.find(".server-restart-page__git-remote");
	const $gitBranch = $root.find(".server-restart-page__git-branch");
	const $gitStatus = $root.find(".server-restart-page__git-status");
	const $logsBody = $root.find(".server-restart-page__logs-body");
	const $progress = $root.find(".server-restart-page__progress");
	const $progressPct = $root.find(".server-restart-page__progress-pct");
	const $progressFill = $root.find(".server-restart-page__progress-fill");
	const $progressMsg = $root.find(".server-restart-page__progress-msg");
	let countdownTimer = null;

	function stopCountdown() {
		if (countdownTimer) {
			clearInterval(countdownTimer);
			countdownTimer = null;
		}
	}

	function formatCountdown(ms) {
		if (ms <= 0) return "00:00";
		const totalSec = Math.floor(ms / 1000);
		const min = Math.floor(totalSec / 60);
		const sec = totalSec % 60;
		return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
	}

	function startCountdown(scheduledAt) {
		stopCountdown();
		const target = Date.parse(scheduledAt);
		if (Number.isNaN(target)) return;

		countdownTimer = setInterval(() => {
			const remaining = target - Date.now();
			const $countdown = $status.find(".server-restart-page__countdown");
			if (!$countdown.length) return;
			$countdown.text(formatCountdown(remaining));
			if (remaining <= 0) {
				stopCountdown();
			}
		}, 1000);
	}

	function setStatusHtml(html, type = "info") {
		$status
			.removeClass("server-restart-page__status--info server-restart-page__status--ok server-restart-page__status--warn")
			.addClass(`server-restart-page__status--${type}`)
			.html(html);
	}

	function toggleActionSections() {
		const isOps = String($action.val() || "") === "Bench Operations (checkboxes)";
		$ops.prop("hidden", !isOps);
	}

	function setGitStatusHtml(html) {
		$gitStatus.html(html);
	}

	function refreshGitStatus() {
		frappe.call({
			method: "restart_app.api.get_app_update_status",
			args: {
				remote: String($gitRemote.val() || "origin").trim() || "origin",
				branch: String($gitBranch.val() || "main").trim() || "main",
			},
			callback(r) {
				if (r.exc || !r.message) return;
				const g = r.message;
				const dirtyLabel = g.dirty ? bi("Yes", "نعم") : bi("No", "لا");
				setGitStatusHtml(
					[
						`<strong>${bi("Repo", "المستودع")}:</strong> ${frappe.utils.escape_html(g.remote)}/${frappe.utils.escape_html(g.branch)}`,
						`<strong>${bi("Local Branch", "الفرع المحلي")}:</strong> ${frappe.utils.escape_html(g.local_branch || "")}`,
						`<strong>${bi("Ahead", "متقدم")}:</strong> ${g.ahead || 0}`,
						`<strong>${bi("Behind", "متأخر")}:</strong> ${g.behind || 0}`,
						`<strong>${bi("Uncommitted Changes", "تغييرات غير محفوظة")}:</strong> ${dirtyLabel}`,
					].join(" &nbsp;|&nbsp; ")
				);
			},
		});
	}

	function renderLogs(logs) {
		if (!Array.isArray(logs) || !logs.length) {
			$logsBody.html(`<tr><td colspan="7">${bi("No logs yet.", "لا توجد سجلات حتى الآن.")}</td></tr>`);
			return;
		}
		const stepLabelFromCommand = (cmd) => {
			const c = String(cmd || "").toLowerCase();
			if (c.includes(" clear-cache")) return bi("Clear Cache", "تفريغ الكاش");
			if (c.includes(" migrate")) return bi("Migrate", "ترحيل");
			if (c.includes(" build --app")) return bi("Build App", "بناء التطبيق");
			if (c.includes("bench restart") || c.includes("supervisorctl restart")) return bi("Restart", "إعادة التشغيل");
			return bi("Custom", "مخصص");
		};
		const rows = logs.map((row) => {
			const statusCls = row.status === "Success" ? "ok" : "warn";
			const commandRaw = String(row.executed_command || "").replace(/\s*\n+\s*/g, " ; ");
			const commandText = frappe.utils.escape_html(commandRaw.slice(0, 160) || "-");
			const detailRaw = row.status === "Success" ? (row.output_log || "") : (row.error_log || "");
			const detailText = String(detailRaw || "").replace(/\s*\n+\s*/g, " | ");
			const detailEsc = frappe.utils.escape_html(String(detailText || "").slice(0, 120) || "-");
			const stepLabel = stepLabelFromCommand(row.executed_command || "");
			return `
				<tr>
					<td>${frappe.utils.escape_html(row.started_at || row.creation || "-")}</td>
					<td><span class="server-restart-page__chip server-restart-page__chip--${statusCls}">${frappe.utils.escape_html(row.status || "-")}</span></td>
					<td>${frappe.utils.escape_html(row.restart_action || "-")}</td>
					<td>${frappe.utils.escape_html(stepLabel)}</td>
					<td>${frappe.utils.escape_html(row.plan_mode || "-")}</td>
					<td title="${frappe.utils.escape_html(row.executed_command || "")}">${commandText}</td>
					<td title="${frappe.utils.escape_html(detailText || "")}">${detailEsc}</td>
				</tr>
			`;
		});
		$logsBody.html(rows.join(""));
	}

	function refreshLogs() {
		frappe.call({
			method: "restart_app.api.get_restart_logs",
			args: { limit: 20 },
			callback(r) {
				if (r.exc || !r.message) return;
				renderLogs(r.message.logs || []);
			},
		});
	}

	function setProgressVisible(on) {
		$progress.prop("hidden", !on);
	}

	function refreshProgress() {
		frappe.call({
			method: "restart_app.api.get_current_restart_progress",
			callback(r) {
				if (r.exc || !r.message) return;
				const p = r.message;
				if (!p.in_progress) {
					setProgressVisible(false);
					return;
				}
				setProgressVisible(true);
				const pct = Math.max(0, Math.min(100, Number(p.percent || 0)));
				$progressPct.text(`${pct}%`);
				$progressFill.css("width", `${pct}%`);
				$progressMsg.text(
					`${p.message || ""} (${bi("Done", "المنجز")}: ${p.completed_steps || 0}/${p.total_steps || 0}${
						p.failed_steps ? `, ${bi("Failed", "فشل")}: ${p.failed_steps}` : ""
					})`
				);
			},
		});
	}

	function refreshStatus() {
		frappe.call({
			method: "restart_app.api.get_restart_status",
			callback(r) {
				if (r.exc || !r.message) return;
				const m = r.message;
				const pieces = [
					`<strong>${bi("Status", "الحالة")}:</strong> ${frappe.utils.escape_html(m.status || bi("Unknown", "غير معروف"))}`,
				];
				if (m.scheduled_at) {
					pieces.push(`<strong>${bi("Scheduled At", "مجدول في")}:</strong> ${frappe.utils.escape_html(m.scheduled_at)}`);
				}
				if (m.restart_action) {
					pieces.push(
						`<strong>${bi("Restart Action", "إجراء إعادة التشغيل")}:</strong> ${frappe.utils.escape_html(m.restart_action)}`
					);
				}
				if (m.last_error) {
					pieces.push(`<strong>${bi("Last Error", "آخر خطأ")}:</strong> ${frappe.utils.escape_html(m.last_error)}`);
				}
				if (m.status === "Pending" && m.scheduled_at) {
					pieces.push(
						`<strong>${bi("Countdown", "العد التنازلي")}:</strong> <span class="server-restart-page__countdown">--:--</span>`
					);
				}
				const tone = m.status === "Failed" ? "warn" : m.status === "Pending" ? "ok" : "info";
				setStatusHtml(pieces.join(" &nbsp;|&nbsp; "), tone);
				$action.val(m.restart_action || "Restart Command");
				$command.val(m.restart_command || "");
				$benchPath.val(m.bench_path || "");
				$benchSite.val(m.bench_site || "");
				$opClearCache.prop("checked", !!m.bench_op_clear_cache);
				$opMigrate.prop("checked", !!m.bench_op_migrate);
				$opBuild.prop("checked", !!m.bench_op_build);
				$opRestart.prop("checked", !!m.bench_op_restart);
				$buildApps.val(m.bench_build_apps || "");
				toggleActionSections();
				if (m.status === "Pending" && m.scheduled_at) {
					startCountdown(m.scheduled_at);
					refreshProgress();
				} else {
					stopCountdown();
					setProgressVisible(false);
				}
			},
		});
	}

	$root.find(".server-restart-page__schedule").on("click", () => {
		const minutesRaw = String($minutes.val() || "").trim();
		const scheduledAtRaw = String($datetime.val() || "").trim();
		if (!minutesRaw && !scheduledAtRaw) {
			frappe.msgprint(bi("Enter Minutes From Now or Scheduled At.", "أدخل دقائق من الآن أو وقتا مجدولا."));
			return;
		}

		frappe.call({
			method: "restart_app.api.schedule_restart",
			args: {
				minutes_from_now: minutesRaw || null,
				scheduled_at: scheduledAtRaw || null,
				restart_action: String($action.val() || "Restart Command"),
				restart_command: String($command.val() || "").trim() || null,
				bench_path: String($benchPath.val() || "").trim() || null,
				bench_site: String($benchSite.val() || "").trim() || null,
				bench_op_clear_cache: $opClearCache.is(":checked") ? 1 : 0,
				bench_op_migrate: $opMigrate.is(":checked") ? 1 : 0,
				bench_op_build: $opBuild.is(":checked") ? 1 : 0,
				bench_op_restart: $opRestart.is(":checked") ? 1 : 0,
				bench_build_apps: String($buildApps.val() || "").trim() || null,
			},
			freeze: true,
			freeze_message: bi("Scheduling restart...", "جار جدولة إعادة التشغيل..."),
			callback(r) {
				if (r.exc) return;
				frappe.show_alert({ message: bi("Restart scheduled; users notified.", "تمت جدولة إعادة التشغيل؛ تم إشعار المستخدمين."), indicator: "green" });
				refreshStatus();
				refreshLogs();
				refreshProgress();
			},
		});
	});

	$root.find(".server-restart-page__cancel").on("click", () => {
		frappe.call({
			method: "restart_app.api.cancel_pending_restart",
			freeze: true,
			freeze_message: bi("Cancelling pending restart...", "جار إلغاء إعادة التشغيل المعلقة..."),
			callback(r) {
				if (r.exc) return;
				frappe.show_alert({ message: bi("Pending restart cleared.", "تمت إزالة إعادة التشغيل المعلقة."), indicator: "orange" });
				refreshStatus();
				refreshLogs();
				setProgressVisible(false);
			},
		});
	});

	$root.find(".server-restart-page__open").on("click", () => {
		frappe.set_route("Form", "Server Restart Scheduler");
	});
	$action.on("change", toggleActionSections);
	$root.find(".server-restart-page__git-check").on("click", refreshGitStatus);
	$root.find(".server-restart-page__git-pull").on("click", () => {
		frappe.call({
			method: "restart_app.api.pull_app_updates",
			args: {
				remote: String($gitRemote.val() || "origin").trim() || "origin",
				branch: String($gitBranch.val() || "main").trim() || "main",
			},
			freeze: true,
			freeze_message: bi("Pulling updates...", "جار سحب التحديثات..."),
			callback(r) {
				if (r.exc) return;
				frappe.show_alert({ message: bi("App updates pulled.", "تم سحب تحديثات التطبيق."), indicator: "green" });
				refreshGitStatus();
			},
		});
	});
	$root.find(".server-restart-page__git-push").on("click", () => {
		frappe.call({
			method: "restart_app.api.push_app_updates",
			args: {
				remote: String($gitRemote.val() || "origin").trim() || "origin",
				branch: String($gitBranch.val() || "main").trim() || "main",
			},
			freeze: true,
			freeze_message: bi("Pushing updates...", "جار دفع التحديثات..."),
			callback(r) {
				if (r.exc) return;
				frappe.show_alert({ message: bi("App updates pushed.", "تم دفع تحديثات التطبيق."), indicator: "green" });
				refreshGitStatus();
			},
		});
	});
	$root.find(".server-restart-page__logs-refresh").on("click", refreshLogs);

	refreshStatus();
	refreshGitStatus();
	refreshLogs();
	setInterval(refreshProgress, 5000);
};
