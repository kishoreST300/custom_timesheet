frappe.listview_settings['Custom Timesheet'] = {
    get_indicator: function(doc) {
        // Always return Saved for any document with docstatus 0
        if (doc.docstatus === 0) {
            doc.status = 'Saved';
            return ['Saved', 'blue', 'status,=,Saved'];
        }
        
        const colors = {
            'Submitted': 'yellow',
            'Approved': 'green',
            'Cancelled': 'red'
        };
        
        return [doc.status || 'Saved', colors[doc.status] || 'blue', 'status,=,' + (doc.status || 'Saved')];
    },

    onload: function(listview) {
        // Update all draft documents to show as Saved
        listview.page.add_action_item(__('Refresh List'), function() {
            listview.refresh();
        });
    },

    refresh: function(listview) {
        // Force status update for all rows
        listview.data.forEach(function(doc) {
            if (doc.docstatus === 0) {
                doc.status = 'Saved';
            }
        });
        listview.render_list();
    }
};
