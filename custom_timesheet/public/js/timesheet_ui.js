frappe.ui.form.on("Custom Timesheet", {
    refresh: function(frm) {
        // Simpler method to get employee details
        frappe.call({
            method: "custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.get_basic_employee_details",
            callback: function(r) {
                if (r.message) {
                    if (frm.is_new()) {
                        frm.set_value('employee', r.message.name);
                        frm.set_value('employee_name', r.message.employee_name);
                        frm.set_value('manager_name', r.message.manager_name || '');
                        frm.refresh_fields(['employee', 'employee_name', 'manager_name']);
                    }
                }
            }
        });
    },

    employee: function(frm) {
        if (!frm.doc.employee) return;
        
        // Clear existing values
        frm.set_value('employee_name', '');
        frm.set_value('manager_name', '');
        
        // Get employee details using API method
        frappe.call({
            method: "custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.get_employee_with_manager",
            args: {
                employee: frm.doc.employee
            },
            callback: function(r) {
                if (r.message) {
                    frm.set_value('employee_name', r.message.employee_name);
                    frm.set_value('manager_name', r.message.manager_name);
                    frm.refresh_fields(['employee_name', 'manager_name']);
                }
            }
        });
    },

    // ...existing code...
});
