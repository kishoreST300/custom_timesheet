# # Copyright (c) 2025, kishore and contributors
# # For license information, please see license.txt

# """
# TimesheetDailyEntry DocType module
# """

# from frappe.model.document import Document
# import frappe
# from frappe import _
# from frappe.utils import getdate

# class CustomTimesheet(Document):
#     def validate(self):
#         self.validate_dates()
#         self.calculate_total_hours()
#         self.validate_entries()
#         self.set_reporting_manager()
    
#     def validate_dates(self):
#         if not self.week_start or not self.week_end:
#             self.set_week_dates()
    
#     def set_week_dates(self):
#         if self.selected_date:
#             self.week_start = frappe.utils.get_first_day_of_week(self.selected_date)
#             self.week_end = frappe.utils.add_days(self.week_start, 6)
    
#     def validate_entries(self):
#         if not self.daily_entries:
#             frappe.throw(_("At least one timesheet entry is required"))
        
#         week_start_date = getdate(self.week_start)
#         week_end_date = getdate(self.week_end)
        
#         for entry in self.daily_entries:
#             if entry.hours < 0 or entry.hours > 24:
#                 frappe.throw(_("Hours must be between 0 and 24 for task {0}").format(entry.task))
#             if not entry.task and entry.hours > 0:
#                 frappe.throw(_("Task is required for hours entry"))
            
#             entry_date = getdate(entry.date)
#             if entry_date < week_start_date or entry_date > week_end_date:
#                 frappe.throw(_("Entry date {0} must be within the week ({1} to {2})").format(
#                     entry.date, self.week_start, self.week_end))

#     def calculate_total_hours(self):
#         self.total_hours = sum(d.hours for d in self.daily_entries if d.hours)

#     def set_reporting_manager(self):
#         if self.employee and not self.reporting_manager:
#             employee_doc = frappe.get_doc("Employee", self.employee)
#             if employee_doc.reports_to:
#                 self.reporting_manager = employee_doc.reports_to

# # Add these standalone functions outside the class
# def validate(doc, method):
#     doc.validate()

# @frappe.whitelist()
# def delete_timesheet_entry(task=None, date=None, employee=None):
#     """Delete a timesheet entry"""
#     try:
#         # Just remove the row from UI, no backend validation needed
#         return {
#             "message": "Entry deleted successfully",
#             "status": True
#         }
#     except Exception as e:
#         return {
#             "status": "error",
#             "message": str(e)
#         }

# @frappe.whitelist()
# def save_timesheet_entry(week_start, entries, employee):
#     """Save timesheet entries for the week"""
#     try:
#         if not employee:
#             frappe.throw(_("Employee ID is required"))
            
#         if not frappe.db.exists("Employee", employee):
#             frappe.throw(_("Employee {0} not found").format(employee))

#         if isinstance(entries, str):
#             entries = frappe.parse_json(entries)

#         # Get existing timesheet or create new one
#         filters = {
#             "employee": employee,
#             "week_start": week_start,
#             "docstatus": 0
#         }
        
#         existing_timesheet = frappe.get_list("Custom Timesheet", filters=filters)
        
#         if existing_timesheet:
#             timesheet = frappe.get_doc("Custom Timesheet", existing_timesheet[0].name)
#             timesheet.daily_entries = []
#         else:
#             timesheet = frappe.new_doc("Custom Timesheet")
#             timesheet.employee = employee
#             timesheet.week_start = week_start
#             timesheet.selected_date = week_start
#             timesheet.status = "Draft"
            
#             # Set week end date
#             timesheet.week_end = frappe.utils.add_days(week_start, 6)

#         # Add entries
#         for entry in entries:
#             if not entry.get('task'):
#                 continue

#             # Verify task exists
#             if not frappe.db.exists("Task", entry.get('task')):
#                 continue

#             if entry.get('hours', 0) > 0 or entry.get('comment'):
#                 row = timesheet.append("daily_entries", {
#                     "date": entry.get('date'),
#                     "task": entry.get('task'),
#                     "hours": entry.get('hours', 0),
#                     "description": entry.get('comment', '')
#                 })
#                 # Ensure required fields are set
#                 row.doctype = "Timesheet Daily Entry"

#         timesheet.save()
        
#         return {
#             "status": "success",
#             "timesheet": timesheet.name,
#             "message": "Timesheet saved successfully"
#         }
#     except Exception as e:
#         frappe.log_error(frappe.get_traceback(), _("Timesheet Save Error"))
#         return {
#             "status": "error",
#             "message": str(e)
#         }

# @frappe.whitelist()
# def submit_timesheet(timesheet_name):
#     """Submit timesheet and notify manager"""
#     try:
#         timesheet = frappe.get_doc("Custom Timesheet", timesheet_name)
        
#         if timesheet.docstatus == 0:  # Draft
#             # Get manager email
#             employee = frappe.get_doc("Employee", timesheet.employee)
#             if not employee.reports_to:
#                 frappe.throw(_("No reporting manager assigned"))

#             manager = frappe.get_doc("Employee", employee.reports_to)
#             if not manager.user_id:
#                 frappe.throw(_("Reporting manager has no user account"))

#             # Submit the timesheet
#             timesheet.status = "Submitted"
#             timesheet.submit()

#             # Send notification to manager
#             notification = frappe.new_doc("Notification Log")
#             notification.subject = f"Timesheet Submitted by {employee.employee_name}"
#             notification.message = f"""
#                 Timesheet for week starting {timesheet.week_start} has been submitted for review.
#                 Total Hours: {sum(entry.hours for entry in timesheet.daily_entries)}
#                 Click here to review: {frappe.utils.get_url_to_form(timesheet.doctype, timesheet.name)}
#             """
#             notification.for_user = manager.user_id
#             notification.type = "Timesheet"
#             notification.document_type = timesheet.doctype
#             notification.document_name = timesheet.name
#             notification.insert(ignore_permissions=True)

#             return {
#                 "status": "success",
#                 "message": "Timesheet submitted successfully"
#             }
#         else:
#             return {
#                 "status": "error",
#                 "message": "Timesheet already submitted"
#             }
#     except Exception as e:
#         frappe.log_error(frappe.get_traceback(), _("Timesheet Submit Error"))
#         return {
#             "status": "error",
#             "message": str(e)
#         }

# @frappe.whitelist()
# def get_timesheet_history(employee, start_date=None, end_date=None):
#     """Get timesheet history for viewing"""
#     filters = {
#         'employee': employee
#     }
#     if start_date:
#         filters['week_start'] = ['>=', start_date]
#     if end_date:
#         filters['week_start'] = ['<=', end_date]
        
#     return frappe.get_list('Custom Timesheet',
#         filters=filters,
#         fields=['name', 'week_start', 'week_end', 'total_hours', 'status', 'docstatus'],
#         order_by='week_start desc'
#     )

# @frappe.whitelist()
# def get_employee_details(user):
#     """Get employee details including manager name"""
#     if not user:
#         return None
        
#     employee = frappe.db.get_value("Employee", 
#         {"user_id": user}, 
#         ["name", "employee_name", "reports_to"], 
#         as_dict=1
#     )
    
#     if employee and employee.reports_to:
#         manager = frappe.db.get_value("Employee",
#             employee.reports_to,
#             ["employee_name as manager_name"],
#             as_dict=1
#         )
#         if manager:
#             employee.update(manager)
    
#     return {
#         "employee": employee
#     }