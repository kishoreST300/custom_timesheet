import frappe
from frappe.model.document import Document

class TimesheetDailyEntry(Document):
    def autoname(self):
        # Generate a unique name for each entry
        self.name = frappe.generate_hash(length=10)

    def validate(self):
        if not self.date:
            frappe.throw("Date is required")
        if self.hours is None:
            self.hours = 0

    def before_save(self):
        if self.hours > 24:
            frappe.throw(_("Hours cannot exceed 24"))
        if self.hours < 0:
            frappe.throw(_("Hours cannot be negative"))
