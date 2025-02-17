import frappe

def execute():
    # Drop existing index if any
    try:
        frappe.db.sql("""
            DROP INDEX IF EXISTS unique_employee_week 
            ON `tabCustom Timesheet`
        """)
    except Exception:
        pass

    # Add unique constraint
    frappe.db.sql("""
        ALTER TABLE `tabCustom Timesheet`
        ADD UNIQUE INDEX unique_employee_week (employee, week_start, docstatus)
    """)
