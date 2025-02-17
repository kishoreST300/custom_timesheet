frappe.ui.form.on("Custom Timesheet", {
    refresh: function(frm) {
        frm.__initial_load = true;
        set_default_date(frm);
        calculateTotal(frm);
        
        // Get current employee details with error handling
        frappe.call({
            method: "custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.get_employee_info",
            args: {
                user: frappe.session.user
            },
            callback: function(r) {
                if (r.message && r.message.status === "success") {
                    let emp = r.message.employee;
                    if (frm.is_new()) {
                        frm.set_value('employee', emp.name);
                        frm.set_value('employee_name', emp.employee_name);
                        frm.set_value('manager_name', emp.manager_name || '');
                        frm.refresh_fields(['employee', 'employee_name', 'manager_name']);
                    }
                } else {
                    frappe.show_alert({
                        message: __('Unable to fetch employee details. Please contact HR.'),
                        indicator: 'red'
                    });
                }
            },
            error: function(r) {
                frappe.show_alert({
                    message: __('Error fetching employee details. Please contact HR.'),
                    indicator: 'red'
                });
            }
        });
    },

    employee: function(frm) {
        if (!frm.doc.employee) return;
        
        // Clear and get new employee details with error handling
        frm.set_value('employee_name', '');
        frm.set_value('manager_name', '');
        
        frappe.call({
            method: "custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.get_employee_info",
            args: {
                user: frappe.session.user
            },
            callback: function(r) {
                if (r.message && r.message.status === "success") {
                    let emp = r.message.employee;
                    frm.set_value('employee_name', emp.employee_name);
                    frm.set_value('manager_name', emp.manager_name || '');
                    frm.refresh_fields(['employee_name', 'manager_name']);
                } else {
                    frappe.show_alert({
                        message: __('Unable to fetch employee details. Please contact HR.'),
                        indicator: 'red'
                    });
                }
            },
            error: function(r) {
                frappe.show_alert({
                    message: __('Error fetching employee details. Please contact HR.'),
                    indicator: 'red'
                });
            }
        });
    },

    selected_date: function(frm) {
        frm.__initial_load = true;
        update_week_dates(frm);
    },

    validate: function(frm) {
        if (frm.doc.daily_entries) {
            frm.doc.daily_entries.forEach(row => {
                if (is_holiday(row.date, frm)) {
                    if (is_weekend(row.date)) {
                        if (row.hours !== 0 || row.project || row.task) {
                            frappe.throw(__("For Holidays on weekends (date: {0}), Hours must be 0 and no Project or Task allowed.", [row.date]));
                        }
                    } else {
                        if (row.hours !== 8 || row.project || row.task) {
                            frappe.throw(__("For Holidays (date: {0}), Hours must be 8 and no Project or Task allowed.", [row.date]));
                        }
                    }
                } else if (is_weekend(row.date)) {
                    if (row.hours !== 0 || row.project || row.task) {
                        frappe.throw(__("For Weekends (date: {0}), Hours must be 0 and no Project or Task allowed.", [row.date]));
                    }
                }
            });
        }
        calculateTotal(frm);
    },

    daily_entries_add: function(frm) {
        calculateTotal(frm);
    },

    daily_entries_remove: function(frm) {
        calculateTotal(frm);
    }
});

function set_default_date(frm) {
    if (!frm.doc.selected_date) {
        frm.set_value("selected_date", frappe.datetime.get_today());
    }
}

function update_week_dates(frm) {
    let selected_date = frm.doc.selected_date;
    if (!selected_date) return;
    let start = moment(selected_date).startOf("isoWeek");
    frm.clear_table("daily_entries");

    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Holiday",
            parent: "Holiday List",
            filters: [
                ["holiday_date", "between", [start.format("YYYY-MM-DD"), start.clone().add(6, "days").format("YYYY-MM-DD")]]
            ],
            fields: ["holiday_date", "description"]
        },
        callback: function(response) {
            let holidays = {};
            if (response.message) {
                response.message.forEach(holiday => {
                    holidays[holiday.holiday_date] = holiday.description;
                });
            }
            frm.holidays = holidays;
            for (let i = 0; i < 7; i++) {
                let date = start.clone().add(i, "days");
                let dateStr = date.format("YYYY-MM-DD");
                let row = frm.add_child("daily_entries");
                row.date = dateStr;
                row.weekday = date.format("dddd");

                if (holidays[dateStr]) {
                    row.description = holidays[dateStr];
                    row.hours = is_weekend(dateStr) ? 0 : 8;
                    row.project = null;
                    row.task = null;
                } else if (is_weekend(dateStr)) {
                    row.description = "Week Off";
                    row.hours = 0;
                    row.project = null;
                    row.task = null;
                }
            }
            frm.refresh_field("daily_entries");
            frm.__initial_load = false;
        }
    });
}

// Child table script
frappe.ui.form.on("Timesheet Daily Entry", {
    weekday: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        let correctWeekday = moment(row.date).format("dddd");
        if (row.weekday !== correctWeekday && !frm.__initial_load) {
            frappe.model.set_value(cdt, cdn, "weekday", correctWeekday);
            frappe.msgprint(__("Weekday is auto-set and cannot be changed."));
        }
    },

    hours: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        if (frm.__initial_load) return;

        if (is_holiday(row.date, frm)) {
            if (is_weekend(row.date)) {
                frappe.model.set_value(cdt, cdn, "hours", 0);
            } else {
                frappe.model.set_value(cdt, cdn, "hours", 8);
            }
        } else if (is_weekend(row.date)) {
            frappe.model.set_value(cdt, cdn, "hours", 0);
        }
        calculateTotal(frm);
    },

    project: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        if (is_holiday(row.date, frm) || is_weekend(row.date)) {
            frappe.model.set_value(cdt, cdn, "project", null);
        }
    },

    task: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        if (is_holiday(row.date, frm) || is_weekend(row.date)) {
            frappe.model.set_value(cdt, cdn, "task", null);
        }
    },

    description: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        if (!row || !row.date) return;
        if (is_holiday(row.date, frm)) {
            frappe.model.set_value(cdt, cdn, "description", get_holiday_name(row.date, frm));
        } else if (is_weekend(row.date)) {
            frappe.model.set_value(cdt, cdn, "description", "Week Off");
        }
    },

    validate: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        if (row.hours < 0) {
            frappe.validated = false;
            frappe.throw(__("Hours cannot be negative."));
        }
    }
});

function is_weekend(date) {
    return ["Saturday", "Sunday"].includes(moment(date).format("dddd"));
}

function is_holiday(date, frm) {
    return frm.holidays && (date in frm.holidays);
}

function get_holiday_name(date, frm) {
    return (frm.holidays && frm.holidays[date]) ? frm.holidays[date] : "Holiday";
}

function calculateTotal(frm) {
    let total = 0;
    (frm.doc.daily_entries || []).forEach(function(row) {
        total += flt(row.hours);
    });
    frm.set_value('total_hours', total);
    if (total > 40) {
        frappe.throw(__('Total hours cannot exceed 40.'));
        frappe.validated = false;
    }
}
