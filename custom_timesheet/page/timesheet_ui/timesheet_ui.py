
import frappe

@frappe.whitelist()
def get_timesheet_template():
    return frappe.render_template(
        "custom_timesheet/page/timesheet_ui/timesheet_ui.html",
        context={}
    )