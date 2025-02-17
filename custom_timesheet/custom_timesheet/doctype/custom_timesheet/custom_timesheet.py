# Copyright (c) 2025, kishore and contributors
# For license information, please see license.txt

from frappe.model.document import Document
import frappe
from frappe import _
from frappe.utils import getdate
from frappe.permissions import has_permission

class CustomTimesheet(Document):
    def validate(self):
        self.flags.ignore_permissions = True
        if not self.selected_date and self.docstatus == 0:
            self.selected_date = self.week_start
            
        # Get employee details using direct SQL
        if self.employee:
            emp = frappe.db.sql("""
                SELECT 
                    e.name,
                    e.employee_name,
                    CASE WHEN m.employee_name IS NOT NULL THEN m.employee_name ELSE '' END as manager_name
                FROM `tabEmployee` e
                LEFT JOIN `tabEmployee` m ON e.reports_to = m.name
                WHERE e.name = %s
            """, self.employee, as_dict=1)
            
            if emp:
                emp = emp[0]
                self.employee_name = emp.employee_name
                self.manager_name = emp.manager_name
        
        self.validate_dates()
        self.calculate_total_hours()
        self.validate_entries()
        self.update_status()

    def update_status(self):
        """Update status automatically based on document state"""
        if self.docstatus == 0:
            self.status = "Draft"
        elif self.docstatus == 1:
            # Don't automatically set to Approved when submitted
            self.status = "Submitted"
        elif self.docstatus == 2:
            self.status = "Cancelled"

    def before_save(self):
        """Ensure only employee or their manager can save"""
        if not self.is_new():
            return
            
        employee = frappe.db.get_value("Employee", 
            {"user_id": frappe.session.user}, 
            ["name", "reports_to"], 
            as_dict=1
        )
        
        if not employee:
            frappe.throw(_("You must be an employee to create timesheets"))
            
        # if employee.name != self.employee:
        #     frappe.throw(_("You can only create timesheets for yourself"))

    def before_submit(self):
        """Ensure selected_date is set before submission"""
        if not self.selected_date:
            self.selected_date = self.week_start
            self.db_set('selected_date', self.week_start, update_modified=False)

    def on_submit(self):
        """Override submit to handle submission"""
        self.status = "Submitted"  # Always set to Submitted on submit
        if self.employee:
            employee = frappe.get_doc("Employee", self.employee)
            if employee.reports_to:
                self.share_with_manager(employee.reports_to)

    def share_with_manager(self, manager_id):
        """Share document with manager without sending notification"""
        manager = frappe.get_doc("Employee", manager_id)
        if manager.user_id:
            # First check if already shared
            if not frappe.db.exists("DocShare", {
                "share_doctype": self.doctype,
                "share_name": self.name,
                "user": manager.user_id
            }):
                # Share without notification
                frappe.share.add(
                    self.doctype,
                    self.name,
                    manager.user_id,
                    read=1,
                    write=1,
                    share=0,
                    notify=0  # Important: Don't notify here
                )
                
                # Send single notification
                self.notify_manager_once(manager.user_id)

    def notify_manager_once(self, manager_user_id):
        """Send a single notification to manager"""
        # Check if notification already sent in last 5 minutes
        five_mins_ago = frappe.utils.add_to_date(None, minutes=-5)
        existing_notification = frappe.db.exists("Notification Log", {
            "document_type": self.doctype,
            "document_name": self.name,
            "for_user": manager_user_id,
            "type": "Alert",
            "creation": (">", five_mins_ago)
        })
        
        if not existing_notification:
            notification = frappe.get_doc({
                "doctype": "Notification Log",
                "subject": f"Timesheet Submitted by {self.employee_name}",
                "message": f"""
                    New timesheet requires your approval:
                    Employee: {self.employee_name}
                    Week Starting: {self.week_start}
                    Total Hours: {self.total_hours}
                """,
                "for_user": manager_user_id,
                "type": "Alert",
                "document_type": self.doctype,
                "document_name": self.name,
                "read": 0
            })
            notification.flags.ignore_permissions = True
            notification.insert()

    def validate_dates(self):
        if not self.week_start or not self.week_end:
            self.set_week_dates()
    
    def set_week_dates(self):
        if self.selected_date:
            self.week_start = frappe.utils.get_first_day_of_week(self.selected_date)
            self.week_end = frappe.utils.add_days(self.week_start, 6)
    
    def validate_entries(self):
        """Validate timesheet entries"""
        # First check if there are any entries at all
        if not self.daily_entries:
            frappe.throw(_("At least one timesheet entry is required"))
        
        # Check if there's at least one entry with hours > 0 or a task
        has_valid_entry = False
        week_start_date = getdate(self.week_start)
        week_end_date = getdate(self.week_end)
        
        for entry in self.daily_entries:
            # Skip validation for holidays and weekends
            if self.is_holiday_or_weekend(entry.date):
                continue
                
            if entry.hours > 0 and entry.task:
                has_valid_entry = True
                break
            
            entry_date = getdate(entry.date)
            if entry_date < week_start_date or entry_date > week_end_date:
                frappe.throw(_("Entry date {0} must be within the week ({1} to {2})").format(
                    entry.date, self.week_start, self.week_end))

        if not has_valid_entry:
            frappe.throw(_("At least one timesheet entry with hours and task is required"))

    def is_holiday_or_weekend(self, date):
        """Check if date is a holiday or weekend"""
        weekday = getdate(date).weekday()
        if weekday in [5, 6]:  # Saturday = 5, Sunday = 6
            return True
            
        # Check for holidays
        holiday = frappe.db.exists("Holiday", {
            "holiday_date": date,
            "parent": "Holiday List"  # Adjust this if you have a different holiday list
        })
        
        return bool(holiday)

    def calculate_total_hours(self):
        self.total_hours = sum(d.hours for d in self.daily_entries if d.hours)

    def set_reporting_manager(self):
        if self.employee and not self.reporting_manager:
            employee_doc = frappe.get_doc("Employee", self.employee)
            if employee_doc.reports_to:
                self.reporting_manager = employee_doc.reports_to

    def on_cancel(self):
        """When timesheet is cancelled"""
        self.status = "Cancelled"
        
        # Notify manager about cancellation
        if self.reporting_manager:
            self.notify_manager_on_cancel()

    def notify_manager_on_cancel(self):
        """Send notification to manager about cancellation"""
        manager = frappe.db.get_value("Employee",
            self.reporting_manager,
            ["user_id", "employee_name"],
            as_dict=1
        )
        
        if not manager or not manager.user_id:
            return

        notification = frappe.get_doc({
            "doctype": "Notification Log",
            "subject": f"Timesheet Cancelled by {self.employee_name}",
            "message": f"""
                Timesheet has been cancelled:
                Employee: {self.employee_name}
                Week Starting: {self.week_start}
                Total Hours: {self.total_hours}
            """,
            "for_user": manager.user_id,
            "type": "Alert",
            "document_type": "Custom Timesheet",
            "document_name": self.name,
            "read": 0
        })
        notification.flags.ignore_permissions = True
        notification.insert()

    def submit(self):
        """Override submit to bypass permission checks"""
        self.flags.ignore_permissions = True
        super(CustomTimesheet, self).submit()

    def save(self, *args, **kwargs):
        self.flags.ignore_permissions = True
        super(CustomTimesheet, self).save(*args, **kwargs)

    def approve(self, comment=None):
        """Approve timesheet and update status"""
        if self.status != "Submitted":
            frappe.throw(_("Only submitted timesheets can be approved"))
            
        self.status = "Approved"
        self.approval_comment = comment
        self.approved_by = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
        self.approved_on = frappe.utils.now()
        self.save()
        
        # Notify employee
        self.notify_employee_of_approval()

    def notify_employee_of_approval(self):
        """Send notification to employee about approval"""
        employee = frappe.get_doc("Employee", self.employee)
        if not employee.user_id:
            return
            
        notification = frappe.get_doc({
            "doctype": "Notification Log",
            "subject": "Timesheet Approved",
            "message": f"""
                Your timesheet for week starting {self.week_start} has been approved.
                Total Hours: {self.total_hours}
                Approved by: {self.approved_by}
                Comment: {self.approval_comment or 'No comment'}
            """,
            "for_user": employee.user_id,
            "type": "Alert",
            "document_type": self.doctype,
            "document_name": self.name,
            "read": 0
        })
        notification.flags.ignore_permissions = True
        notification.insert()

    def on_update(self):
        """Share document with employee and their manager"""
        # Clear existing shares using direct SQL
        frappe.db.sql("""
            DELETE FROM `tabDocShare` 
            WHERE share_doctype = %s 
            AND share_name = %s
        """, (self.doctype, self.name))
        frappe.db.commit()
        
        # Share with employee
        if self.employee:
            employee = frappe.get_doc("Employee", self.employee)
            if employee.user_id:
                frappe.share.add(
                    self.doctype,
                    self.name,
                    employee.user_id,
                    read=1,
                    write=1 if self.docstatus == 0 else 0,
                    share=0,
                    notify=0  # Set notify to 0 to prevent duplicate notifications
                )
            
            # For submitted status, sharing with manager is handled in on_submit

    def on_update_after_submit(self):
        """Update status after approval"""
        if self.approved_by:
            self.status = "Approved"
        self.db_update()

# Add these standalone functions outside the class
def validate(doc, method):
    doc.validate()

@frappe.whitelist()
def delete_timesheet_entry(task=None, date=None, employee=None):
    """Delete a timesheet entry"""
    try:
        # Just remove the row from UI, no backend validation needed
        return {
            "message": "Entry deleted successfully",
            "status": True
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

@frappe.whitelist()
def save_timesheet_entry(week_start, entries, employee):
    """Save timesheet entries for the week"""
    try:
        if not employee:
            frappe.throw(_("Employee ID is required"))

        # Lock to prevent concurrent saves
        lock_key = f"timesheet_{employee}_{week_start}"
        if frappe.cache().exists(lock_key):
            frappe.throw(_("Another save operation is in progress. Please wait a moment."))
        
        # Fix the expires_in parameter to expires_in_sec
        frappe.cache().set_value(lock_key, True, expires_in_sec=30)

        try:
            # Check for existing timesheets
            existing = frappe.get_all(
                "Custom Timesheet",
                filters={
                    "employee": employee,
                    "week_start": week_start,
                    "docstatus": ["!=", 2]  # Not cancelled
                },
                fields=["name", "docstatus"]
            )

            timesheet = None
            
            if existing:
                if any(ts.docstatus == 1 for ts in existing):
                    frappe.throw(_("A submitted timesheet already exists for this week"))
                
                # Get the first draft timesheet and delete others
                timesheet = frappe.get_doc("Custom Timesheet", existing[0].name)
                
                # Delete other drafts if any
                for ts in existing[1:]:
                    frappe.delete_doc("Custom Timesheet", ts.name, force=1)
                
                # Clear existing entries
                timesheet.daily_entries = []
            else:
                timesheet = frappe.new_doc("Custom Timesheet")
                timesheet.employee = employee
                timesheet.week_start = week_start
                timesheet.week_end = frappe.utils.add_days(week_start, 6)
                timesheet.selected_date = week_start
                timesheet.status = "Draft"

            if isinstance(entries, str):
                entries = frappe.parse_json(entries)

            # Add entries
            for entry in entries:
                if not entry.get('task'): continue
                hours = float(entry.get('hours', 0))
                if hours < 0: continue

                timesheet.append("daily_entries", {
                    "date": entry.get('date'),
                    "task": entry.get('task'),
                    "hours": hours,
                    "description": entry.get('comment', ''),
                    "weekday": frappe.utils.get_weekday(entry.get('date'))
                })

            if not timesheet.daily_entries:
                frappe.throw(_("Please add at least one valid entry"))

            timesheet.calculate_total_hours()
            timesheet.flags.ignore_permissions = True
            timesheet.save()

            frappe.db.commit()

            return {
                "status": "success",
                "timesheet": timesheet.name,
                "message": "Timesheet saved successfully",
                "data": {
                    "daily_entries": timesheet.daily_entries,
                    "docstatus": timesheet.docstatus,
                    "status": timesheet.status,
                    "total_hours": timesheet.total_hours
                }
            }

        finally:
            frappe.cache().delete_value(lock_key)

    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), _("Timesheet Save Error"))
        return {
            "status": "error",
            "message": str(e)
        }

def cleanup_duplicate_timesheets(employee, week_start, current_timesheet):
    """Delete any duplicate draft timesheets"""
    frappe.db.sql("""
        DELETE FROM `tabCustom Timesheet`
        WHERE employee = %s
        AND week_start = %s
        AND name != %s
        AND docstatus = 0
    """, (employee, week_start, current_timesheet))
    frappe.db.commit()

@frappe.whitelist()
def submit_timesheet(timesheet_name):
    """Submit timesheet and notify manager"""
    try:
        timesheet = frappe.get_doc("Custom Timesheet", timesheet_name)
        
        # Get current user's employee record using SQL
        current_employee = frappe.db.sql("""
            SELECT name, employee_name 
            FROM `tabEmployee` 
            WHERE user_id = %s
        """, frappe.session.user, as_dict=1)
        
        if not current_employee:
            frappe.throw(_("User not linked to any employee record"))
        
        current_employee = current_employee[0]
        
        # Set flags to bypass permissions
        timesheet.flags.ignore_permissions = True
        
        if timesheet.docstatus != 0:
            frappe.throw(_("Timesheet is already submitted"))
            
        # Update status and submit
        timesheet.status = "Submitted"
        timesheet.submit()
        
        return {
            "status": "success",
            "message": "Timesheet submitted successfully"
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Timesheet Submit Error"))
        return {
            "status": "error",
            "message": str(e)
        }

@frappe.whitelist()
def cancel_timesheet(timesheet_name):
    """Cancel timesheet"""
    try:
        if not timesheet_name:
            frappe.throw(_("Timesheet ID is required"))

        timesheet = frappe.get_doc("Custom Timesheet", timesheet_name)
        timesheet.flags.ignore_permissions = True
        timesheet.cancel()
        frappe.db.commit()

        return {
            "status": "success",
            "message": "Timesheet cancelled successfully"
        }

    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), "Timesheet Cancel Error")
        return {
            "status": "error",
            "message": str(e)
        }

@frappe.whitelist()
def get_timesheet_history(employee, start_date=None, end_date=None):
    """Get timesheet history for viewing"""
    filters = {
        'employee': employee
    }
    if start_date:
        filters['week_start'] = ['>=', start_date]
    if end_date:
        filters['week_start'] = ['<=', end_date]
        
    return frappe.get_list('Custom Timesheet',
        filters=filters,
        fields=['name', 'week_start', 'week_end', 'total_hours', 'status', 'docstatus'],
        order_by='week_start desc'
    )

@frappe.whitelist()
def get_employee_details(user):
    """Get employee details including manager name bypassing permission checks"""
    if not user:
        return None
        
    # Get employee and manager details in a single query
    result = frappe.db.sql("""
        SELECT 
            e.name,
            e.employee_name,
            e.reports_to,
            IFNULL(m.employee_name, '') as manager_name
        FROM `tabEmployee` e
        LEFT JOIN `tabEmployee` m ON e.reports_to = m.name
        WHERE e.user_id = %s
        LIMIT 1
    """, user, as_dict=1)
    
    if not result:
        return None
        
    return {
        "employee": result[0]
    }

@frappe.whitelist()
def employee_has_permission(doc, user=None, permission_type=None):
    """Always return True for Employee doctype"""
    return True

def has_permission(doc, ptype="read", user=None):
    """Custom permission check for Custom Timesheet"""
    return True  # Allow all access for now

@frappe.whitelist()
def get_current_employee_details():
    """Get current user's employee details bypassing permissions"""
    try:
        # Use frappe.db.get_value instead of SQL
        employee = frappe.db.get_value(
            "Employee",
            {"user_id": frappe.session.user},
            ["name", "employee_name", "reports_to"],
            as_dict=1
        )

        if employee and employee.get('reports_to'):
            manager_name = frappe.db.get_value(
                "Employee",
                employee.reports_to,
                "employee_name"
            )
            employee['manager_name'] = manager_name

        return employee
    except Exception:
        return None

@frappe.whitelist()
def get_all_employee_details():
    """Get all required employee details without permission checks"""
    try:
        # Direct SQL query to bypass all permissions
        employee = frappe.db.sql("""
            SELECT 
                e.name, 
                e.employee_name,
                e.reports_to,
                m.employee_name as manager_name
            FROM `tabEmployee` e
            LEFT JOIN `tabEmployee` m ON e.reports_to = m.name
            WHERE e.user_id = %s
        """, frappe.session.user, as_dict=1)

        if not employee:
            return None

        return employee[0]
    except Exception:
        return None

@frappe.whitelist()
def get_current_user_employee():
    """Get current user's employee details without permission checks"""
    return frappe.db.sql("""
        SELECT 
            e.name, 
            e.employee_name,
            e.reports_to,
            m.employee_name as manager_name
        FROM `tabEmployee` e
        LEFT JOIN `tabEmployee` m ON e.reports_to = m.name
        WHERE e.user_id = %s
    """, frappe.session.user, as_dict=1)

@frappe.whitelist()
def get_employee_with_manager(employee=None):
    """Get employee and manager details bypassing permissions"""
    try:
        if not employee:
            # Get current user's employee record
            emp = frappe.db.get_value(
                "Employee",
                {"user_id": frappe.session.user},
                ["name", "employee_name", "reports_to"],
                as_dict=1
            )
        else:
            # Get specified employee record
            emp = frappe.db.get_value(
                "Employee",
                employee,
                ["name", "employee_name", "reports_to"],
                as_dict=1
            )

        if emp and emp.get('reports_to'):
            manager_name = frappe.db.get_value(
                "Employee",
                emp.reports_to,
                "employee_name"
            )
            emp['manager_name'] = manager_name or ''

        return emp
    except Exception:
        return None

# Add this new method to handle permission checks
@frappe.whitelist()
def check_employee_permission(employee=None):
    """Check if current user has permission for this employee"""
    try:
        current_employee = frappe.get_value(
            "Employee",
            {"user_id": frappe.session.user},
            ["name", "reports_to"],
            as_dict=1
        )
        
        if not current_employee:
            return {"allowed": False}
            
        # Allow if user is the employee
        if current_employee.name == employee:
            return {"allowed": True}
            
        # Allow if user is the manager
        if employee:
            reportee = frappe.get_value("Employee", employee, "reports_to")
            if reportee == current_employee.name:
                return {"allowed": True}
                
        # Allow system managers
        if "System Manager" in frappe.get_roles():
            return {"allowed": True}
            
        return {"allowed": False}
    except Exception:
        return {"allowed": False}

@frappe.whitelist()
def get_basic_employee_details():
    """Get employee details without permission checks"""
    result = frappe.db.sql("""
        SELECT 
            e.name,
            e.employee_name,
            IFNULL(m.employee_name, '') as manager_name
        FROM `tabEmployee` e
        LEFT JOIN `tabEmployee` m ON e.reports_to = m.name
        WHERE e.user_id = %s
        LIMIT 1
    """, frappe.session.user, as_dict=1)
    
    return result[0] if result else None

@frappe.whitelist()
def get_user_employee_details():
    """Get employee details using direct SQL without permission checks"""
    result = frappe.db.sql("""
        SELECT 
            e.name,
            e.employee_name,
            IFNULL(m.employee_name, '') as manager_name
        FROM `tabEmployee` e
        LEFT JOIN `tabEmployee` m ON e.reports_to = m.name
        WHERE e.user_id = %s
        LIMIT 1
    """, frappe.session.user, as_dict=1)
    
    return result[0] if result else None

@frappe.whitelist()
def get_employee_info(user=None):
    """Get employee information with proper permission handling"""
    if not user:
        user = frappe.session.user
    
    try:
        # Use direct SQL to bypass permission issues
        result = frappe.db.sql("""
            SELECT 
                e.name,
                e.employee_name,
                e.reports_to,
                IFNULL(m.employee_name, '') as manager_name
            FROM `tabEmployee` e
            LEFT JOIN `tabEmployee` m ON e.reports_to = m.name
            WHERE e.user_id = %s
            LIMIT 1
        """, user, as_dict=1)
        
        if not result:
            return {
                'status': 'error',
                'message': 'No employee record found for this user'
            }

        employee = result[0]
        
        # Return formatted response
        return {
            'status': 'success',
            'employee': {
                'name': employee.name,
                'employee_name': employee.employee_name,
                'reports_to': employee.reports_to,
                'manager_name': employee.manager_name
            }
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_employee_info: {str(e)}")
        return {
            'status': 'error',
            'message': 'Could not retrieve employee information'
        }

# ...existing code...

@frappe.whitelist()
def check_existing_timesheet(employee, week_start):
    """Check if a submitted timesheet already exists for the week"""
    existing = frappe.db.exists("Custom Timesheet", {
        "employee": employee,
        "week_start": week_start,
        "docstatus": 1  # Submitted
    })
    
    return {
        "exists": bool(existing)
    }

# ...existing code...

@frappe.whitelist()
def approve_timesheet(timesheet_name, comment=None):
    """Approve timesheet and notify employee"""
    try:
        timesheet = frappe.get_doc("Custom Timesheet", timesheet_name)
        
        if timesheet.docstatus != 1:
            frappe.throw(_("Only submitted timesheets can be approved"))
            
        # Get current user's employee record
        current_employee = frappe.db.get_value("Employee", 
            {"user_id": frappe.session.user},
            ["name", "employee_name", "reports_to"],
            as_dict=1
        )
        
        if not current_employee:
            frappe.throw(_("User not linked to any employee record"))
            
        # Check if user is the manager
        employee = frappe.get_doc("Employee", timesheet.employee)
        if employee.reports_to != current_employee.name:
            frappe.throw(_("Only the reporting manager can approve timesheets"))
            
        # Prevent self-approval
        if timesheet.employee == current_employee.name:
            frappe.throw(_("You cannot approve your own timesheet"))
            
        if not current_employee.employee_name:
            frappe.throw(_("Manager name not found"))

        # Update approval details with employee name and status
        frappe.db.set_value('Custom Timesheet', timesheet_name, {
            'status': 'Approved',  # Status is set automatically
            'approved_by': current_employee.name,
            'approved_by_name': current_employee.employee_name,
            'approved_on': frappe.utils.now_datetime(),
            'approval_comment': comment
        }, update_modified=True)

        frappe.db.commit()
        
        # Reload and notify
        timesheet.reload()
        notify_employee_of_approval(timesheet)
        timesheet.on_update()
        
        return {
            "status": "success",
            "message": "Timesheet approved successfully",
            "timesheet": timesheet.as_dict()
        }
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(str(e), "Timesheet Approval Error")
        return {
            "status": "error",
            "message": str(e)
        }

def notify_employee_of_approval(timesheet):
    """Send notification to employee about approval"""
    employee = frappe.get_doc("Employee", timesheet.employee)
    if not employee.user_id:
        return
        
    notification = frappe.get_doc({
        "doctype": "Notification Log",
        "subject": "Timesheet Approved",
        "message": f"""
            Your timesheet for week starting {timesheet.week_start} has been approved.
            Total Hours: {timesheet.total_hours}
            Approved by: {frappe.get_value("Employee", timesheet.approved_by, "employee_name")}
            Comment: {timesheet.approval_comment or 'No comment'}
        """,
        "for_user": employee.user_id,
        "type": "Alert",
        "document_type": "Custom Timesheet",
        "document_name": timesheet.name,
        "read": 0
    })
    notification.flags.ignore_permissions = True
    notification.insert()

# ...rest of existing code...

@frappe.whitelist()
def get_timesheet_for_week(employee, week_start):
    """Get existing timesheet data for the week"""
    try:
        # Search for any timesheet in this week (draft, submitted, or approved)
        timesheet = frappe.get_list(
            "Custom Timesheet",
            filters={
                "employee": employee,
                "week_start": week_start,
                "docstatus": ["in", [0, 1]]  # Include both draft and submitted
            },
            fields=["name", "status", "docstatus"],
            limit=1
        )
        
        if timesheet:
            # Get full timesheet document with all fields
            doc = frappe.get_doc("Custom Timesheet", timesheet[0].name)
            return {
                "status": "success",
                "timesheet": doc.as_dict()
            }
            
        return {
            "status": "success",
            "timesheet": None
        }
    except Exception as e:
        frappe.log_error(f"Error fetching timesheet: {str(e)}")
        return {
            "status": "error",
            "message": str(e)
        }

# ...rest of existing code...

@frappe.whitelist()
def check_manager_permission(employee):
    """Check if current user is the manager of the employee"""
    try:
        current_employee = frappe.db.get_value(
            "Employee", 
            {"user_id": frappe.session.user}, 
            "name"
        )
        
        if not current_employee:
            return {"is_manager": False}
            
        employee_doc = frappe.get_doc("Employee", employee)
        is_manager = employee_doc.reports_to == current_employee
        
        return {
            "is_manager": is_manager,
            "message": "Success" if is_manager else "Not authorized"
        }
    except Exception as e:
        frappe.log_error("Manager Permission Check Error")
        return {
            "is_manager": False,
            "message": str(e)
        }

# ...rest of existing code...
