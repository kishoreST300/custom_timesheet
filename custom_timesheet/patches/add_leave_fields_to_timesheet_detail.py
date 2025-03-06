import frappe

def execute():
    # Add new columns to Custom Timesheet Detail
    fields = [
        ("is_leave", "INT(1) NOT NULL DEFAULT 0"),
        ("leave_type", "VARCHAR(140)"),
        ("is_half_day", "INT(1) NOT NULL DEFAULT 0"),
        ("is_holiday", "INT(1) NOT NULL DEFAULT 0"),
        ("holiday_name", "VARCHAR(140)")
    ]
    
    for field, field_type in fields:
        if not frappe.db.has_column("Custom Timesheet Detail", field):
            frappe.db.sql(f"""ALTER TABLE `tabCustom Timesheet Detail`
                ADD COLUMN {field} {field_type}""")
    
    frappe.db.commit()

    # Clear cache to reflect new changes
    frappe.clear_cache(doctype="Custom Timesheet Detail")
