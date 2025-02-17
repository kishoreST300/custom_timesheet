frappe.listview_settings['Custom Timesheet'] = {
    get_indicator: function(doc) {
        if (doc.docstatus === 0) {
            return [__("Draft"), "gray", "docstatus,=,0"];
        } else if (doc.docstatus === 1) {
            if (doc.workflow_state === "Approved") {
                return [__("Approved"), "green", "workflow_state,=,Approved"];
            }
            return [__("Submitted"), "orange", "workflow_state,=,Submitted"];
        } else if (doc.docstatus === 2) {
            return [__("Cancelled"), "red", "docstatus,=,2"];
        }
    },

    // Add button to refresh list after actions
    onload: function(listview) {
        listview.page.add_inner_button(__("Refresh"), function() {
            listview.refresh();
        });
    },

    formatters: {
        status: function(value) {
            let colors = {
                'Draft': 'gray',
                'Submitted': 'orange',
                'Approved': 'green',
                'Rejected': 'red',
                'Cancelled': 'red'
            };
            return `<span class="indicator-pill ${colors[value] || 'gray'}">${value}</span>`;
        }
    }
};
