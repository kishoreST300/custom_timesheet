class CustomTimesheet(Document):
    def __init__(self, *args, **kwargs):
        super(CustomTimesheet, self).__init__(*args, **kwargs)
        # Always set status to Saved, even for new docs
        self.status = "Saved"
        self.total_hours = 0
        if not hasattr(self, 'reporting_manager'):
            self.reporting_manager = None

    def before_insert(self):
        """Set status before a new document is inserted"""
        self.status = "Saved"

    def after_insert(self):
        """Force status update after insert"""
        self.db_set('status', 'Saved', update_modified=False)
        frappe.db.commit()

    # ...existing code...
