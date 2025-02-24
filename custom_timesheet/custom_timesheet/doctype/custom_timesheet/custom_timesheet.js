// Copyright (c) 2025, kishore and contributors
// For license information, please see license.txt

frappe.ui.form.on('Custom Timesheet', {
    refresh: function(frm) {
        // Ensure status is always Saved for non-submitted docs
        if (frm.doc.docstatus === 0) {
            frm.doc.status = 'Saved';
            frm.refresh_field('status');
        }

        // Set simple indicator
        if (frm.doc.status) {
            let color = {
                'Saved': 'blue',
                'Submitted': 'yellow',
                'Approved': 'green',
                'Cancelled': 'red'
            }[frm.doc.status] || 'gray';
            
            frm.page.set_indicator(__(frm.doc.status), color);
        }

        // Clear any existing indicators in dashboard
        if (frm.dashboard) {
            frm.dashboard.clear_headline();
        }

        // Get employee details using direct SQL
        frappe.call({
            method: "custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.get_user_employee_details",
            callback: function(r) {
                if (r.message && frm.is_new()) {
                    frm.set_value('employee', r.message.name);
                    frm.set_value('employee_name', r.message.employee_name);
                    frm.set_value('manager_name', r.message.manager_name);
                    frm.refresh_fields(['employee', 'employee_name', 'manager_name']);
                }
            }
        });

        // Add submit button for draft timesheets
        if(frm.doc.docstatus === 0) {
            frm.page.set_primary_action(__('Submit'), function() {
                frappe.call({
                    method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.submit_timesheet',
                    args: {
                        timesheet_name: frm.doc.name
                    },
                    callback: function(r) {
                        if (r.message && r.message.status === "success") {
                            frappe.show_alert({
                                message: __('Timesheet submitted successfully'),
                                indicator: 'green'
                            });
                            frm.reload_doc();
                        } else if (r.message && r.message.status === "error") {
                            frappe.msgprint(r.message.message);
                        }
                    }
                });
            });
        }

        frappe.call({
            method: "custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.get_current_user_employee",
            callback: function(r) {
                if(r.message && r.message.length > 0) {
                    let emp = r.message[0];
                    if (frm.is_new()) {
                        frm.set_value('employee', emp.name);
                        frm.set_value('employee_name', emp.employee_name);
                        frm.set_value('manager_name', emp.manager_name);
                        frm.refresh_fields(['employee', 'employee_name', 'manager_name']);
                    }
                }
            }
        });

        // Add cancel button for submitted documents
        if(frm.doc.docstatus === 1) {
            frm.add_custom_button(__('Cancel'), function() {
                frappe.confirm(
                    __('Are you sure you want to cancel this timesheet?'),
                    function() {
                        frappe.call({
                            method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.cancel_timesheet',
                            args: {
                                timesheet_name: frm.doc.name
                            },
                            callback: function(r) {
                                if (r.message && r.message.status === "success") {
                                    frappe.show_alert({
                                        message: __('Timesheet cancelled successfully'),
                                        indicator: 'green'
                                    });
                                    frm.reload_doc();
                                }
                            }
                        });
                    }
                );
            }, __('Actions'));
        }

        // Replace the existing approval logic with this
        if (frm.doc.docstatus === 1 && frm.doc.status === "Submitted") {
            frappe.call({
                method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.check_manager_permission',
                args: { 
                    employee: frm.doc.employee 
                },
                callback: function(r) {
                    if (r.message && r.message.is_manager) {
                        // Add approve button in form header
                        frm.page.set_secondary_action(__('Approve'), function() {
                            frappe.prompt([
                                {
                                    label: 'Approval Comment',
                                    fieldname: 'comment',
                                    fieldtype: 'Small Text',
                                    reqd: 1
                                }
                            ], function(values) {
                                frappe.call({
                                    method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.approve_timesheet',
                                    args: {
                                        timesheet_name: frm.doc.name,
                                        comment: values.comment
                                    },
                                    freeze: true,
                                    freeze_message: __('Approving Timesheet...'),
                                    callback: function(r) {
                                        if (r.message && r.message.status === "success") {
                                            frm.reload_doc();
                                            frm.page.clear_secondary_action();
                                            frappe.show_alert({
                                                message: __("Timesheet approved successfully"),
                                                indicator: 'green'
                                            });
                                        } else {
                                            frappe.msgprint(r.message.message);
                                        }
                                    }
                                });
                            }, __('Approve Timesheet'), __('Submit'));
                        }, 'btn-primary');
                    }
                }
            });
        }

        // Remove approve button if already approved
        if (frm.doc.status === "Approved" || frm.doc.workflow_state === "Approved") {
            frm.page.clear_secondary_action();
        }

        // Show approval status
        if (frm.doc.workflow_state === "Approved" && frm.doc.status === "Approved") {
            frm.remove_custom_button('Approve');
            frm.dashboard.clear_headline();
            frm.dashboard.add_indicator(__("Approved"), "green");
            if (frm.doc.approved_by && frm.doc.approved_on) {
                frm.dashboard.add_comment(__("Approved by {0} on {1}", [
                    frappe.bold(frm.doc.approved_by_name || frm.doc.approved_by),
                    frappe.datetime.str_to_user(frm.doc.approved_on)
                ]));
            }
        }

        // Show approval indicator
        if (frm.doc.workflow_state === "Approved") {
            frm.dashboard.add_indicator(
                __("Approved by {0} on {1}", [
                    frm.doc.approved_by,
                    frappe.datetime.str_to_user(frm.doc.approved_on)
                ]),
                "green"
            );
        }

        // Add date picker button (remove old calendar button code)
        if (frm.doc.docstatus === 0) {
            frm.page.add_inner_button(__('Select Week'), function() {
                let d = new frappe.ui.Dialog({
                    title: __('Select Week'),
                    fields: [
                        {
                            label: __('Select Date'),
                            fieldname: 'selected_date',
                            fieldtype: 'Date',
                            default: frm.doc.selected_date || frappe.datetime.get_today(),
                            onchange: function() {
                                let date = d.get_value('selected_date');
                                let weekStart = frappe.datetime.get_first_day_of_week(date);
                                let weekEnd = frappe.datetime.add_days(weekStart, 6);
                                d.set_value('week_range', 
                                    `<div class="week-range">${frappe.datetime.str_to_user(weekStart)} 
                                     to ${frappe.datetime.str_to_user(weekEnd)}</div>`
                                );
                            }
                        },
                        {
                            fieldname: 'week_range',
                            fieldtype: 'HTML',
                            label: __('Week Range')
                        }
                    ],
                    primary_action_label: __('Select'),
                    primary_action: function() {
                        let selected_date = d.get_value('selected_date');
                        frm.set_value('selected_date', selected_date)
                            .then(() => {
                                // Only close after date is set
                                d.hide();
                                frm.save();
                            });
                    }
                });
                
                // Style the week range display
                d.$wrapper.find('.week-range').css({
                    'margin-top': '10px',
                    'padding': '5px',
                    'background-color': 'var(--bg-light-gray)',
                    'border-radius': '4px',
                    'text-align': 'center'
                });
                
                d.show();
                // Trigger initial week range display
                d.fields_dict.selected_date.df.onchange();
            }, __("Actions"));
        }

        // Remove the headline alert code block completely
        // Replace the indicator formatter code and keep only the header indicator
        if (!frm.is_new()) {
            frm.page.set_indicator(frm.doc.status, {
                'Saved': 'blue',
                'Submitted': 'yellow',
                'Approved': 'green',
                'Cancelled': 'red'
            }[frm.doc.status]);
        }

        // ...rest of existing refresh code...
    },

    setup: function(frm) {
        // Limit employee field to current user or their reportees
        frm.set_query("employee", function() {
            return {
                query: "frappe.client.get_list",
                filters: [
                    ["Employee", "user_id", "=", frappe.session.user],
                    ["Employee", "reports_to", "=", frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")]
                ]
            };
        });
    },

    employee: function(frm) {
        if(!frm.doc.employee) return;
        
        frm.set_value('employee_name', '');
        frm.set_value('manager_name', '');
        
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

    validate: function(frm) {
        let hasValidEntry = false;
        let missingDescriptions = [];
        
        frm.doc.daily_entries.forEach((entry, idx) => {
            if (entry.hours > 0) {  // Only validate entries with hours
                if (entry.description) {
                    hasValidEntry = true;
                } else {
                    missingDescriptions.push(
                        `${frappe.datetime.str_to_user(entry.date)} (${entry.hours} hours)`
                    );
                }
            }
        });

        if (!hasValidEntry) {
            frappe.show_alert({
                message: __('Please add at least one entry with both hours and description'),
                indicator: 'red'
            }, 5);
            frappe.validated = false;
            return;
        }

        if (missingDescriptions.length > 0) {
            frappe.show_alert({
                message: __('Please add descriptions for entries on:<br>{0}', 
                    [missingDescriptions.join('<br>')]),
                indicator: 'red'
            }, 7);
            frappe.validated = false;
            return;
        }
    },

    selected_date: function(frm) {
        if (frm.doc.selected_date) {
            let weekStart = frappe.datetime.get_first_day_of_week(frm.doc.selected_date);
            let weekEnd = frappe.datetime.add_days(weekStart, 6);
            
            frm.set_value('week_start', weekStart);
            frm.set_value('week_end', weekEnd);
            
            // Fetch holidays for this week
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Holiday List',
                    filters: [['holiday_date', 'between', [weekStart, weekEnd]]],
                    fields: ['holiday_date', 'description']
                },
                callback: function(r) {
                    let holidays = {};
                    if (r.message) {
                        r.message.forEach(h => holidays[h.holiday_date] = h.description);
                    }
                    
                    // Clear and regenerate entries
                    frm.clear_table('daily_entries');
                    let currentDate = weekStart;
                    
                    for (let i = 0; i < 7; i++) {
                        let entry = frm.add_child('daily_entries');
                        entry.date = currentDate;
                        entry.weekday = frappe.datetime.get_weekday(currentDate);
                        
                        // Set hours based on holiday/weekend
                        if (holidays[currentDate]) {
                            entry.hours = frappe.datetime.get_weekday(currentDate) in [0, 6] ? 0 : 8;
                            entry.description = holidays[currentDate];
                        } else if (frappe.datetime.get_weekday(currentDate) in [0, 6]) {
                            entry.hours = 0;
                            entry.description = 'Weekend';
                        } else {
                            entry.hours = 0;
                        }
                        
                        currentDate = frappe.datetime.add_days(currentDate, 1);
                    }
                    
                    frm.refresh_field('daily_entries');
                }
            });
        }
    },

    week_start: function(frm) {
        if (!frm.doc.selected_date) {
            frm.set_value('selected_date', frm.doc.week_start);
        }
    },

    after_save: function(frm) {
        // Update the indicator after saving
        frm.page.set_indicator(frm.doc.status, frappe.utils.guess_colour(frm.doc.status));
        frm.reload_doc(); // Reload to get latest status
    }
});

// Add calendar picker function
frappe.calendar_picker = function(opts) {
    let dialog = new frappe.ui.Dialog({
        title: opts.title || __("Select Date"),
        fields: [
            {
                fieldtype: 'Date',
                fieldname: 'selected_date',
                label: __('Select Date'),
                default: opts.date || frappe.datetime.get_today(),
                onchange: function() {
                    let date = dialog.get_value('selected_date');
                    if (opts.mode === 'week') {
                        // Show week range
                        let week_start = frappe.datetime.get_first_day_of_week(date);
                        let week_end = frappe.datetime.add_days(week_start, 6);
                        dialog.set_value('date_range', 
                            frappe.datetime.str_to_user(week_start) + 
                            ' to ' + 
                            frappe.datetime.str_to_user(week_end)
                        );
                    }
                }
            },
            {
                fieldtype: 'HTML',
                fieldname: 'date_range',
                options: '<div class="date-range-display"></div>'
            }
        ],
        primary_action_label: __("Select"),
        primary_action: function() {
            if (opts.onSelect) {
                opts.onSelect(dialog.get_value('selected_date'));
            }
            dialog.hide();
        }
    });

    dialog.show();

    // Trigger onchange to show initial week range
    dialog.fields_dict.selected_date.df.onchange();
};
