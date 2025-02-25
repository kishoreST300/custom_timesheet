frappe.listview_settings['Custom Timesheet'] = {
    get_indicator: function(doc) {
        // Always force "Saved" status for docstatus 0
        if (doc.docstatus === 0) {
            doc.status = 'Saved';  // Update the doc status
            frappe.db.set_value('Custom Timesheet', doc.name, 'status', 'Saved');  // Update in database
            return ['Saved', 'blue', 'status,=,Saved'];
        }

        const colors = {
            'Submitted': 'yellow',
            'Approved': 'green',
            'Cancelled': 'red'
        };
        
        return [__(doc.status), colors[doc.status] || 'blue', `status,=,${doc.status}`];
    },

    onload: function(listview) {
        // Force refresh to update all statuses
        listview.refresh();
    },

    refresh: function(listview) {
        // Update all draft documents to show as Saved
        if (listview.data) {
            listview.data.forEach(function(doc) {
                if (doc.docstatus === 0) {
                    doc.status = 'Saved';
                    // Update in database
                    frappe.db.set_value('Custom Timesheet', doc.name, 'status', 'Saved');
                }
            });
            
            // Force render update
            listview.render_list();
        }

        // Set up periodic refresh
        if (!listview._status_refresh) {
            listview._status_refresh = setInterval(() => {
                listview.refresh();
            }, 30000); // Refresh every 30 seconds
        }
    },

    hide_name_column: true,

    formatters: {
        status: function(value) {
            // Always show Saved for draft status
            return value === 'Draft' ? __('Saved') : __(value);
        }
    }
};
