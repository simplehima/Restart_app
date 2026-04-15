frappe.ui.form.on("Server Restart Scheduler", {
	refresh(frm) {
		const bi = (en, ar) => `${__(en)} / ${ar}`;
		frm.disable_save();
		const toggleActionFields = () => {
			const action = frm.doc.restart_action || "Restart Command";
			const isCmd = action === "Restart Command";
			const isScript = action === "Run restart_sites.py command";
			const isOps = action === "Bench Operations (checkboxes)";

			frm.set_df_property("restart_command", "hidden", !isCmd);
			frm.set_df_property("restart_sites_command", "hidden", !isScript);

			[
				"bench_path",
				"bench_site",
				"bench_supervisor_targets",
				"bench_op_clear_cache",
				"bench_op_migrate",
				"bench_op_build",
				"bench_op_restart",
				"bench_build_apps",
			].forEach((fn) => frm.set_df_property(fn, "hidden", !isOps));
			frm.set_df_property("section_break_bench_ops", "hidden", !isOps);
			frm.set_df_property("column_break_bench_ops_1", "hidden", !isOps);
		};
		toggleActionFields();

		frm.add_custom_button(bi("Schedule & Notify", "جدولة وإشعار"), () => {
			const minutes = frm.doc.minutes_from_now;
			const scheduled_at = frm.doc.scheduled_at;
			if (!minutes && !scheduled_at) {
				frappe.msgprint(bi("Set either Scheduled At or Minutes From Now.", "حدد وقتا مجدولا أو دقائق من الآن."));
				return;
			}
			if ((frm.doc.restart_action || "Restart Command") === "Bench Operations (checkboxes)") {
				const hasOp =
					cint(frm.doc.bench_op_clear_cache) ||
					cint(frm.doc.bench_op_migrate) ||
					cint(frm.doc.bench_op_build) ||
					cint(frm.doc.bench_op_restart);
				if (!hasOp) {
					frappe.msgprint(
						bi(
							"Select at least one bench operation (clear cache, migrate, build, restart).",
							"اختر عملية Bench واحدة على الأقل (تفريغ الكاش، ترحيل، بناء، إعادة تشغيل)."
						)
					);
					return;
				}
			}
			frappe.call({
				method: "restart_app.api.schedule_restart",
				args: {
					scheduled_at: scheduled_at || null,
					minutes_from_now: minutes || null,
				},
				freeze: true,
				freeze_message: bi("Scheduling...", "جار الجدولة..."),
				callback(r) {
					if (!r.exc) {
						frappe.show_alert({ message: bi("Restart scheduled; users notified.", "تمت جدولة إعادة التشغيل؛ تم إشعار المستخدمين."), indicator: "green" });
						frm.reload_doc();
					}
				},
			});
		});

		frm.add_custom_button(bi("Cancel pending", "إلغاء المعلق"), () => {
			frappe.call({
				method: "restart_app.api.cancel_pending_restart",
				freeze: true,
				callback(r) {
					if (!r.exc) {
						frappe.show_alert({ message: bi("Pending restart cleared.", "تمت إزالة إعادة التشغيل المعلقة."), indicator: "orange" });
						frm.reload_doc();
					}
				},
			});
		});
	},
	restart_action(frm) {
		frm.trigger("refresh");
	},
});
