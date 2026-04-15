(function () {
	if (window.__restartAppNotifierInitialized) return;
	window.__restartAppNotifierInitialized = true;

	const ROOT_ID = "restart-app-notifier";
	const bi = (en, ar) => `${__(en)} / ${ar}`;

	function pad2(n) {
		return String(n).padStart(2, "0");
	}

	function formatCountdown(ms) {
		if (ms <= 0) return "00:00";
		const totalSec = Math.floor(ms / 1000);
		const m = Math.floor(totalSec / 60);
		const s = totalSec % 60;
		return `${pad2(m)}:${pad2(s)}`;
	}

function toParseableDateString(raw) {
	if (!raw || typeof raw !== "string") return raw;
	if (raw.includes("T")) return raw;
	return raw.replace(" ", "T").replace(/\.(\d{3})\d+$/, ".$1");
}

	function minutesCeil(ms) {
		if (ms <= 0) return 0;
		return Math.max(1, Math.ceil(ms / 60000));
	}

	let targetMs = null;
	let intervalId = null;
	let currentIsoUtc = null;
	let lastBeepSecond = null;
	let statusPollId = null;
	let acknowledgedScheduleKey = null;

	function ackStorageKey(isoUtc) {
		return `restart_app:ack:${isoUtc}`;
	}

	function clearTimer() {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
		lastBeepSecond = null;
	}

	function playBeep() {
		const AudioCtx = window.AudioContext || window.webkitAudioContext;
		if (!AudioCtx) return;
		try {
			const ctx = new AudioCtx();
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "sine";
			osc.frequency.value = 880;
			gain.gain.setValueAtTime(0.0001, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start();
			osc.stop(ctx.currentTime + 0.22);
		} catch (e) {
			// ignore audio errors/restrictions
		}
	}

	function ensureRoot() {
		let root = document.getElementById(ROOT_ID);
		if (root) return root;

		root = document.createElement("div");
		root.id = ROOT_ID;
		root.className = "restart-notifier restart-notifier--bilingual";
		root.innerHTML = `
			<div class="restart-notifier__backdrop" aria-hidden="true"></div>
			<div class="restart-notifier__card" role="dialog" aria-live="polite" aria-modal="true">
				<div class="restart-notifier__title-wrap">
					<div class="restart-notifier__status-dot" aria-hidden="true"></div>
					<div class="restart-notifier__title">${bi("Server restart", "إعادة تشغيل الخادم")}</div>
				</div>
				<div class="restart-notifier__meta">${bi("Maintenance notice", "تنبيه صيانة")}</div>
				<div class="restart-notifier__message"></div>
				<div class="restart-notifier__countdown" hidden></div>
				<div class="restart-notifier__actions">
					<button type="button" class="btn btn-primary btn-sm restart-notifier__ack">${bi("OK", "موافق")}</button>
					<button type="button" class="btn btn-default btn-sm restart-notifier__reload" hidden>${bi("Reload Page", "إعادة تحميل الصفحة")}</button>
				</div>
			</div>
		`;
		document.body.appendChild(root);

		root.querySelector(".restart-notifier__ack").addEventListener("click", () => acknowledge(root));
		root.querySelector(".restart-notifier__reload").addEventListener("click", () => window.location.reload());

		return root;
	}

	function setVisible(root, on) {
		root.classList.toggle("restart-notifier--visible", on);
		root.style.display = on ? "block" : "none";
	}

	function setModalMode(root, on) {
		root.classList.toggle("restart-notifier--modal", on);
	}

	function setMinimizedMode(root, on) {
		root.classList.toggle("restart-notifier--minimized", on);
	}

	function setUrgentMode(root, on) {
		root.classList.toggle("restart-notifier--urgent", on);
	}

	function acknowledge(root) {
		if (currentIsoUtc) {
			acknowledgedScheduleKey = currentIsoUtc;
			try {
				localStorage.setItem(ackStorageKey(currentIsoUtc), "1");
			} catch (e) {
				// ignore storage failures (private mode, etc.)
			}
		}
		setModalMode(root, false);
		setMinimizedMode(root, true);
		const actions = root.querySelector(".restart-notifier__actions");
		if (actions) actions.hidden = true;
		const countdown = root.querySelector(".restart-notifier__countdown");
		if (countdown) countdown.hidden = false;
	}

	function tick(root) {
		if (targetMs == null) return;

		const remaining = targetMs - Date.now();
		const messageEl = root.querySelector(".restart-notifier__message");
		const countdownEl = root.querySelector(".restart-notifier__countdown");
		const titleEl = root.querySelector(".restart-notifier__title");
		const metaEl = root.querySelector(".restart-notifier__meta");

		if (remaining <= 0) {
			clearTimer();
			setModalMode(root, true);
			setMinimizedMode(root, false);
			setUrgentMode(root, false);
			if (titleEl) titleEl.textContent = bi("Server restart", "إعادة تشغيل الخادم");
			if (metaEl) metaEl.textContent = bi("Action required", "إجراء مطلوب");
			if (messageEl) {
				messageEl.textContent = bi("The server restarted. Please reload this page.", "تمت إعادة تشغيل الخادم. يرجى إعادة تحميل الصفحة.");
				messageEl.hidden = false;
			}
			if (countdownEl) countdownEl.hidden = true;
			const ackBtn = root.querySelector(".restart-notifier__ack");
			const reloadBtn = root.querySelector(".restart-notifier__reload");
			if (ackBtn) ackBtn.hidden = true;
			if (reloadBtn) reloadBtn.hidden = false;
			playBeep();
			return;
		}

		const mmss = formatCountdown(remaining);
		const mins = minutesCeil(remaining);
		const remainingSec = Math.ceil(remaining / 1000);
		setUrgentMode(root, remainingSec <= 10);

		if (remainingSec <= 10 && remainingSec > 0 && lastBeepSecond !== remainingSec) {
			lastBeepSecond = remainingSec;
			playBeep();
		}

		if (root.classList.contains("restart-notifier--modal") && messageEl) {
			if (metaEl) metaEl.textContent = "Maintenance notice / تنبيه صيانة";
			messageEl.innerHTML = "";
			messageEl.appendChild(
				document.createTextNode(
					`A server restart is scheduled in ${String(mins)} minutes. Please save your work. / تمت جدولة إعادة تشغيل الخادم خلال ${String(mins)} دقيقة. يرجى حفظ عملك.`
				)
			);
			messageEl.hidden = false;
			if (countdownEl) countdownEl.hidden = true;
			if (remainingSec <= 10) {
				setModalMode(root, true);
				setMinimizedMode(root, false);
				const actions = root.querySelector(".restart-notifier__actions");
				const ackBtn = root.querySelector(".restart-notifier__ack");
				const reloadBtn = root.querySelector(".restart-notifier__reload");
				if (actions) actions.hidden = false;
				if (ackBtn) ackBtn.hidden = false;
				if (reloadBtn) reloadBtn.hidden = true;
				messageEl.textContent = bi(
					"Restart in {0} seconds. Save work now.",
					"إعادة التشغيل خلال {0} ثانية. احفظ عملك الآن."
				).replace("{0}", String(remainingSec));
			}
		} else if (countdownEl) {
			if (metaEl) {
				metaEl.textContent = "Auto-minimized: countdown running / تم التصغير تلقائيا: العد التنازلي يعمل";
			}
			countdownEl.textContent = mmss;
			countdownEl.hidden = false;
			if (messageEl) {
				messageEl.hidden = false;
				messageEl.textContent =
					"Please save your work and keep this tab open. / يرجى حفظ عملك وإبقاء هذه الصفحة مفتوحة.";
			}
			if (titleEl) titleEl.textContent = "Restart in / إعادة التشغيل خلال";
		}
	}

	function startSchedule(isoUtc, options = {}) {
		const { preferMinimized = false } = options;
		const parsed = Date.parse(toParseableDateString(isoUtc));
		if (Number.isNaN(parsed)) return;

		const root = ensureRoot();
		currentIsoUtc = isoUtc;
		targetMs = parsed;

		clearTimer();
		setVisible(root, true);

		let acked = preferMinimized;
		if (!acked) {
			if (acknowledgedScheduleKey && acknowledgedScheduleKey === isoUtc) {
				acked = true;
			}
		}
		if (!acked) {
			try {
				acked = localStorage.getItem(ackStorageKey(isoUtc)) === "1";
			} catch (e) {
				acked = false;
			}
		}

		if (acked) {
			setModalMode(root, false);
			setMinimizedMode(root, true);
			const actions = root.querySelector(".restart-notifier__actions");
			if (actions) actions.hidden = true;
			const countdownEl = root.querySelector(".restart-notifier__countdown");
			if (countdownEl) countdownEl.hidden = false;
			const messageEl = root.querySelector(".restart-notifier__message");
			if (messageEl) {
				messageEl.hidden = false;
				messageEl.textContent =
					"Please save your work and keep this tab open. / يرجى حفظ عملك وإبقاء هذه الصفحة مفتوحة.";
			}
			const titleEl = root.querySelector(".restart-notifier__title");
			if (titleEl) titleEl.textContent = "Restart in / إعادة التشغيل خلال";
			const metaEl = root.querySelector(".restart-notifier__meta");
			if (metaEl) {
				metaEl.textContent = "Auto-minimized: countdown running / تم التصغير تلقائيا: العد التنازلي يعمل";
			}
			const reloadBtn = root.querySelector(".restart-notifier__reload");
			if (reloadBtn) reloadBtn.hidden = true;
		} else {
			setModalMode(root, true);
			setMinimizedMode(root, false);
			const actions = root.querySelector(".restart-notifier__actions");
			if (actions) actions.hidden = false;
			const messageEl = root.querySelector(".restart-notifier__message");
			if (messageEl) {
				messageEl.hidden = false;
				messageEl.textContent = "";
			}
			const titleEl = root.querySelector(".restart-notifier__title");
			if (titleEl) titleEl.textContent = bi("Server restart", "إعادة تشغيل الخادم");
			const metaEl = root.querySelector(".restart-notifier__meta");
			if (metaEl) metaEl.textContent = bi("Maintenance notice", "تنبيه صيانة");
			const countdownEl = root.querySelector(".restart-notifier__countdown");
			if (countdownEl) countdownEl.hidden = true;
			const reloadBtn = root.querySelector(".restart-notifier__reload");
			if (reloadBtn) reloadBtn.hidden = true;
			const ackBtn = root.querySelector(".restart-notifier__ack");
			if (ackBtn) ackBtn.hidden = false;
		}
		tick(root);
		intervalId = setInterval(() => tick(root), 1000);
	}

	function cancelSchedule() {
		clearTimer();
		targetMs = null;
		currentIsoUtc = null;
		acknowledgedScheduleKey = null;
		const root = document.getElementById(ROOT_ID);
		if (!root) return;

		setVisible(root, false);
		setModalMode(root, false);
		setMinimizedMode(root, false);
		setUrgentMode(root, false);

		const actions = root.querySelector(".restart-notifier__actions");
		if (actions) actions.hidden = false;

		const messageEl = root.querySelector(".restart-notifier__message");
		if (messageEl) {
			messageEl.hidden = false;
			messageEl.textContent = "";
		}

		const countdownEl = root.querySelector(".restart-notifier__countdown");
		if (countdownEl) {
			countdownEl.textContent = "";
			countdownEl.hidden = true;
		}
		const ackBtn = root.querySelector(".restart-notifier__ack");
		const reloadBtn = root.querySelector(".restart-notifier__reload");
		if (ackBtn) ackBtn.hidden = false;
		if (reloadBtn) reloadBtn.hidden = true;
	}

	function bindRealtime() {
		const f = window.frappe;
		if (!f || !f.realtime || !f.realtime.on) return;

		f.realtime.on("server_restart_scheduled", (data) => {
			if (data && data.scheduled_at_utc) {
				startSchedule(data.scheduled_at_utc);
			}
		});

		f.realtime.on("server_restart_cancelled", () => {
			cancelSchedule();
		});
	}

	function pollStatusFallback() {
		function setDelayedPendingState(scheduleToken) {
			const root = ensureRoot();
			setVisible(root, true);
			setModalMode(root, false);
			setMinimizedMode(root, true);
			setUrgentMode(root, false);
			currentIsoUtc = scheduleToken;
			targetMs = Date.parse(toParseableDateString(scheduleToken));

			const titleEl = root.querySelector(".restart-notifier__title");
			const metaEl = root.querySelector(".restart-notifier__meta");
			const messageEl = root.querySelector(".restart-notifier__message");
			const countdownEl = root.querySelector(".restart-notifier__countdown");
			const actions = root.querySelector(".restart-notifier__actions");

			if (titleEl) titleEl.textContent = bi("Restart delayed", "تأخرت إعادة التشغيل");
			if (metaEl) metaEl.textContent = bi("Waiting for backend", "بانتظار الخلفية");
			if (messageEl) {
				messageEl.hidden = false;
				messageEl.textContent = bi(
					"Restart command is still running or worker is offline. You can keep working and refresh later.",
					"أمر إعادة التشغيل ما زال يعمل أو أن العامل غير متصل. يمكنك متابعة العمل وإعادة التحميل لاحقا."
				);
			}
			if (countdownEl) countdownEl.hidden = true;
			if (actions) actions.hidden = true;
		}

		const handleStatus = (m) => {
			if (!m) return;
			if (m.status === "Pending") {
				const scheduleToken = m.scheduled_at_utc || m.scheduled_at;
				if (!scheduleToken) return;
				const parsedToken = Date.parse(toParseableDateString(scheduleToken));
				if (!Number.isNaN(parsedToken) && parsedToken <= Date.now()) {
					setDelayedPendingState(scheduleToken);
					return;
				}
				const sameSchedule =
					targetMs != null &&
					!Number.isNaN(parsedToken) &&
					Math.abs(parsedToken - targetMs) < 1000;

				if (!sameSchedule && (currentIsoUtc !== scheduleToken || targetMs == null)) {
					startSchedule(scheduleToken);
				} else {
					const root = ensureRoot();
					setVisible(root, true);
				}
			} else if (m.status !== "Pending") {
				cancelSchedule();
			}
		};

		if (window.frappe && frappe.call) {
			frappe.call({
				method: "restart_app.api.get_restart_status",
				callback(r) {
					if (r.exc || !r.message) return;
					handleStatus(r.message);
				},
			});
			return;
		}

		fetch("/api/method/restart_app.api.get_restart_status", {
			method: "GET",
			credentials: "same-origin",
			headers: { Accept: "application/json" },
		})
			.then((res) => (res.ok ? res.json() : null))
			.then((payload) => handleStatus(payload && payload.message))
			.catch(() => {});
	}

	function startStatusPolling() {
		if (statusPollId) return;
		pollStatusFallback();
		statusPollId = setInterval(pollStatusFallback, 10000);
	}

	function initNotifier() {
		bindRealtime();
		startStatusPolling();

		const pending = window.frappe && frappe.boot && frappe.boot.server_restart_pending;
		if (pending && pending.scheduled_at_utc) {
			startSchedule(pending.scheduled_at_utc);
		}
	}

	if (window.frappe && typeof frappe.ready === "function") {
		frappe.ready(initNotifier);
	} else if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initNotifier, { once: true });
	} else {
		initNotifier();
	}
})();
