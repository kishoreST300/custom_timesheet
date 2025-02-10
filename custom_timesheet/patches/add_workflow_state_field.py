import frappe

def execute():
    """Add workflow_state field to Custom Timesheet doctype"""
    if not frappe.db.has_column('Custom Timesheet', 'workflow_state'):
        frappe.db.add_column('Custom Timesheet', 'workflow_state', 'varchar(140)')
        
        # Update existing records to have a default state
        frappe.db.sql("""
            UPDATE `tabCustom Timesheet`
            SET workflow_state = CASE
                WHEN status = 'Draft' THEN 'Draft'
                WHEN status = 'Submitted' THEN 'Submitted'
                WHEN status = 'Approved' THEN 'Approved'
                WHEN status = 'Rejected' THEN 'Rejected'
                ELSE 'Draft'
            END
        """)
