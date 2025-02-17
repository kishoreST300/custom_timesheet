frappe.pages['timesheet-ui'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Timesheet',
        single_column: true
    });

    // Update method path
    frappe.call({
        method: 'custom_timesheet.page.timesheet_ui.timesheet_ui.get_timesheet_template',
        callback: function(r) {
            if (r.message) {
                var content = $(r.message).appendTo(page.main);
                initializeTimesheet(page, content);
            } else {
                console.error("No template content received");
            }
        }
    });
};

// ...rest of existing code...
