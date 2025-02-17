frappe.pages['timesheet-ui'].on_page_load = function(wrapper) {
    // Declare currentDate at the top level so it's accessible everywhere
    let currentDate = moment();
    let holidays = {};
    let currentTimesheet = null;
    let employeeInfo = null;

    // Helper functions - define ALL utility functions at the top
    const is_weekend = (date) => {
        return [0, 6].includes(moment(date).day());
    };

    const isHoliday = (date) => {
        return holidays[date] !== undefined;
    };

    const updateTotals = () => {
        let totalHours = 0;
        let billableHours = 0;
        let nonBillableHours = 0;
        let timeOffHours = 0;

        $('.timesheet-grid tr').each(function () {
            let rowTotal = 0;
            $(this).find('.day-hours').each(function () {
                let hours = parseFloat($(this).val()) || 0;
                let isTimeOff = $(this).closest('tr').find('.description').text().includes('Holiday') ||
                    $(this).closest('tr').find('.description').text().includes('Week Off');
                let isBillable = $(this).closest('tr').find('.task-input').val() !== '';

                rowTotal += hours;
                totalHours += hours;

                if (isTimeOff) timeOffHours += hours;
                else if (isBillable) billableHours += hours;
                else nonBillableHours += hours;
            });
            $(this).find('.row-total').text(rowTotal.toFixed(2));
        });

        // Update summary section
        $('.total-hours').text(totalHours.toFixed(2));
        $('.billable-hours').text(billableHours.toFixed(2));
        $('.non-billable-hours').text(nonBillableHours.toFixed(2));
        $('.time-off-hours').text(timeOffHours.toFixed(2));

        // Update progress bar with enhanced colors
        let progressPercentage = (totalHours / 40) * 100;
        let progressBar = $('.progress-bar');
        progressBar.css('width', `${Math.min(progressPercentage, 100)}%`);

        // Update progress bar color based on percentage
        if (totalHours >= 40) {
            progressBar.removeClass('bg-primary bg-warning bg-info')
                .addClass('bg-success')
                .css('background-color', '#28a745');
        } else if (totalHours >= 32) { // 80% or more
            progressBar.removeClass('bg-primary bg-success bg-info')
                .addClass('bg-warning')
                .css('background-color', '#ffc107');
        } else if (totalHours >= 16) { // 40% or more
            progressBar.removeClass('bg-warning bg-success bg-info')
                .addClass('bg-primary')
                .css('background-color', '#007bff');
        } else { // less than 40%
            progressBar.removeClass('bg-warning bg-success bg-primary')
                .addClass('bg-info')
                .css('background-color', '#17a2b8');
        }
    };

    const renderTimesheet = () => {
        let weekStart = currentDate.clone().startOf('isoWeek');
        let weekEnd = currentDate.clone().endOf('isoWeek');

        // Update date range display
        $('.date-range').text(`${weekStart.format('MMM DD')} - ${weekEnd.format('MMM DD, YYYY')}`);

        // Update grid dates
        for (let i = 0; i < 7; i++) {
            let day = weekStart.clone().add(i, 'days');
            let $header = $('.timesheet-grid th').eq(i + 1);
            $header.html(`
                ${day.format('ddd')}<br>
                <div class="text-muted small">${day.format('MMM DD')}</div>
            `);
            if (is_weekend(day)) {
                $header.addClass('weekend');
            } else {
                $header.removeClass('weekend');
            }
        }

        // Load initial data immediately
        loadTimesheetData();
        
        // Then fetch holidays and update
        fetchAndPopulateTimesheet();
    };

    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Timesheet',
        single_column: true
    });

    var content = $(`
        <div class="timesheet-container">
            <div class="week-navigation d-flex align-items-center mb-4">
                <button class="btn btn-sm btn-default mr-2 prev-week">
                    <i class="fa fa-chevron-left"></i>
                </button>
                <span class="date-range mr-2"></span>
                <button class="btn btn-sm btn-default mr-2 next-week">
                    <i class="fa fa-chevron-right"></i>
                </button>
                <button class="btn btn-sm btn-default calendar-btn">
                    <i class="fa fa-calendar"></i>
                </button>
            </div>

            <div class="summary-section mb-4">
                <div class="employee-info mb-3">
                    <div class="row">
                        <div class="col-md-6">
                            <label class="text-muted">Employee</label>
                            <div class="employee-name font-weight-bold"></div>
                        </div>
                        <div class="col-md-6">
                            <label class="text-muted">Reporting Manager</label>
                            <div class="reporting-manager font-weight-bold"></div>
                        </div>
                    </div>
                </div>
                <div class="d-flex align-items-center mb-2">
                    <span class="mr-2">Total</span>
                    <i class="fa fa-info-circle text-muted"></i>
                </div>
                <div class="d-flex align-items-center">
                    <div class="mr-4">
                        <span class="total-hours">0:00</span>
                        <span class="text-muted">/40:00</span>
                    </div>
                    <div class="flex-grow-1">
                        <div class="progress" style="height: 8px;">
                            <div class="progress-bar bg-primary" style="width: 0%"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="timesheet-grid">
                <table class="table table-bordered">
                    <thead>
                        <tr>
                            <th style="width: 200px">Task</th>
                            ${Array.from({ length: 7 }, (_, i) => `
                                <th class="text-center">
                                    <div class="day-header"></div>
                                    <div class="text-muted small"></div>
                                </th>
                            `).join('')}
                            <th style="width: 80px">Total</th>
                        </tr>
                    </thead>
                    <tbody id="timesheet-entries">
                        <!-- Single row will be added here -->
                    </tbody>
                </table>
            </div>

            <div class="footer-actions d-flex align-items-center mt-4">
                <div class="ml-auto">
                    <button class="btn btn-default btn-save mr-2">Save</button>
                    <button class="btn btn-primary">Submit</button>
                </div>
            </div>
        </div>
    `).appendTo(page.main);

    // Add custom styles
    $('<style>')
        .prop('type', 'text/css')
        .html(`
            .timesheet-container { padding: 20px; }
            .project-cell { padding: 8px; }
            .project-actions { margin-top: 8px; }
            .table input.form-control { border: none; background: transparent; }
            .totals-row { background-color: #f8f9fa; }
            .progress { background-color: #e9ecef; }
            .weekend { background-color: #f8f9fa; }
            .delete-row { padding: 2px 5px; }
            .delete-row:hover { background-color: #dc3545; color: white; }
            .day-cell { display: flex; flex-direction: column; }
            .comment-input { 
                margin-top: 5px; 
                font-size: 12px; 
                padding: 2px 5px;
                border-top: 1px solid #eee;
             }
            .task-selector-container { padding: 10px 0; }
            .task-name { display: flex; justify-content: space-between; align-items: center; }
            .delete-row { visibility: visible !important; }
            .employee-info {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 4px;
                margin-bottom: 15px;
            }
            .employee-info label {
                font-size: 12px;
                margin-bottom: 2px;
            }

            /* Dark mode styles */
            [data-theme="dark"] .timesheet-container {
                background-color: var(--bg-color);
                color: #ffffff;
            }
            [data-theme="dark"] .table {
                color: #ffffff;
            }
            [data-theme="dark"] .table-bordered td,
            [data-theme="dark"] .table-bordered th {
                border-color: #3e4959;
            }
            [data-theme="dark"] .employee-info,
            [data-theme="dark"] .weekend,
            [data-theme="dark"] .timesheet-status,
            [data-theme="dark"] .comment-display,
            [data-theme="dark"] .task-input-container input {
                background-color: var(--fg-color) !important;
            }
            [data-theme="dark"] .btn-default {
                background-color: var(--fg-color);
                color: #ffffff;
                border-color: #3e4959;
            }
            [data-theme="dark"] .btn-default:hover {
                background-color: var(--bg-color);
            }
            [data-theme="dark"] .comment-input {
                border-top-color: #3e4959;
                background-color: var(--fg-color);
                color: #ffffff;
            }
            [data-theme="dark"] .text-muted {
                color: rgba(255, 255, 255, 0.6) !important;
            }
            [data-theme="dark"] .progress {
                background-color: var(--fg-color);
            }
            [data-theme="dark"] input.form-control {
                color: #ffffff;
                background-color: var(--fg-color) !important;
            }
            [data-theme="dark"] .indicator-separator {
                background: #3e4959;
            }
            [data-theme="dark"] .task-input-container input {
                border-color: #3e4959 !important;
            }
            .weekend .text-muted {
                padding: 6px 0;
                font-size: 0.9em;
            }
            [data-theme="dark"] .weekend .text-muted {
                color: var(--gray-500) !important;
            }
            .holiday-text {
                padding: 8px 0;
                font-weight: 500;
            }
            [data-theme="dark"] .holiday-text {
                color: var(--gray-400) !important;
            }
            .progress-bar {
                transition: width 0.3s ease-in-out, background-color 0.3s ease-in-out;
            }
            [data-theme="dark"] .progress-bar.bg-success {
                background-color: #2ecc71 !important;
            }
            [data-theme="dark"] .progress-bar.bg-warning {
                background-color: #f1c40f !important;
            }
            [data-theme="dark"] .progress-bar.bg-primary {
                background-color: #3498db !important;
            }
            [data-theme="dark"] .progress-bar.bg-info {
                background-color: #00bcd4 !important;
            }
        `)
        .appendTo('head');

    // Store currentDate in a more accessible way
    window.timesheetApp = {
        currentDate: moment(),
        updateDateRange: null,
        renderTimesheet: null
    };

    initializeTimesheet(page, content, window.timesheetApp.currentDate);
};

function initializeTimesheet(page, content, initialDate) {
    let holidays = {};
    let currentTimesheet = null;
    let employeeInfo = null;

    // Reference the global state
    const timesheetApp = window.timesheetApp;

    // Helper functions - define ALL utility functions at the top
    const is_weekend = (date) => {
        return [0, 6].includes(moment(date).day());
    };

    const isHoliday = (date) => {
        return holidays[date] !== undefined;
    };

    const updateTotals = () => {
        let totalHours = 0;
        let billableHours = 0;
        let nonBillableHours = 0;
        let timeOffHours = 0;

        $('.timesheet-grid tr').each(function () {
            let rowTotal = 0;
            $(this).find('.day-hours').each(function () {
                let hours = parseFloat($(this).val()) || 0;
                let isTimeOff = $(this).closest('tr').find('.description').text().includes('Holiday') ||
                    $(this).closest('tr').find('.description').text().includes('Week Off');
                let isBillable = $(this).closest('tr').find('.task-input').val() !== '';

                rowTotal += hours;
                totalHours += hours;

                if (isTimeOff) timeOffHours += hours;
                else if (isBillable) billableHours += hours;
                else nonBillableHours += hours;
            });
            $(this).find('.row-total').text(rowTotal.toFixed(2));
        });

        // Update summary section
        $('.total-hours').text(totalHours.toFixed(2));
        $('.billable-hours').text(billableHours.toFixed(2));
        $('.non-billable-hours').text(nonBillableHours.toFixed(2));
        $('.time-off-hours').text(timeOffHours.toFixed(2));

        // Update progress bar with enhanced colors
        let progressPercentage = (totalHours / 40) * 100;
        let progressBar = $('.progress-bar');
        progressBar.css('width', `${Math.min(progressPercentage, 100)}%`);

        // Update progress bar color based on percentage
        if (totalHours >= 40) {
            progressBar.removeClass('bg-primary bg-warning bg-info')
                .addClass('bg-success')
                .css('background-color', '#28a745');
        } else if (totalHours >= 32) { // 80% or more
            progressBar.removeClass('bg-primary bg-success bg-info')
                .addClass('bg-warning')
                .css('background-color', '#ffc107');
        } else if (totalHours >= 16) { // 40% or more
            progressBar.removeClass('bg-warning bg-success bg-info')
                .addClass('bg-primary')
                .css('background-color', '#007bff');
        } else { // less than 40%
            progressBar.removeClass('bg-warning bg-success bg-primary')
                .addClass('bg-info')
                .css('background-color', '#17a2b8');
        }
    };

    const generateEntryRow = (entry) => {
        const rowId = `row_${Date.now()}`;
        return `
            <tr data-date="${entry.date}" data-task="${entry.task}" data-row-id="${rowId}">
                <td>
                    <div class="project-cell">
                        <div class="task-name">
                            <div class="task-input-container" data-row="${rowId}"></div>
                        </div>
                    </div>
                </td>
                ${Array.from({length: 7}, (_, i) => {
                    let dayDate = moment(entry.date).clone().startOf('isoWeek').add(i, 'days');
                    let isDayHolidayOrWeekend = holidays[dayDate.format('YYYY-MM-DD')] || is_weekend(dayDate);
                    let comment = isDayHolidayOrWeekend ? 
                        (holidays[dayDate.format('YYYY-MM-DD')] || "Week Off") : '';
                    let hours = isDayHolidayOrWeekend && !is_weekend(dayDate) ? 8 : 0;
                    let dateStr = dayDate.format('YYYY-MM-DD');
                    
                    // Look for entry data in taskGroups if available
                    if (entry.entries && entry.entries[dateStr]) {
                        hours = entry.entries[dateStr].hours || hours;
                        comment = entry.entries[dateStr].comment || comment;
                    }
                    
                    return `
                        <td class="${isDayHolidayOrWeekend ? 'weekend' : ''}">
                            <div class="day-cell">
                                ${!isDayHolidayOrWeekend ? `
                                    <input type="number"
                                        class="form-control text-center day-hours"
                                        data-date="${dateStr}"
                                        value="${hours}"
                                        min="0"
                                        max="24"
                                        step="0.5">
                                    <input type="text"
                                        class="form-control comment-input"
                                        placeholder="Add comment"
                                        value="${frappe.utils.escape_html(comment)}">
                                ` : `
                                    <div class="text-muted text-center holiday-text">${comment}</div>
                                    ${!is_weekend(dayDate) ? `
                                        <input type="hidden"
                                            class="form-control text-center day-hours"
                                            data-date="${dateStr}"
                                            value="${hours}">
                                    ` : ''}
                                `}
                            </div>
                        </td>
                    `;
                }).join('')}
                <td class="text-center row-total">0.00</td>
            </tr>
        `;
    };

    const fetchEmployeeInfo = () => {
        return frappe.call({
            method: "custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.get_employee_info",
            callback: (r) => {
                if (r.message && r.message.status === "success") {
                    employeeInfo = r.message.employee;
                    $('.employee-name').text(employeeInfo.employee_name || 'Not Available');
                    $('.reporting-manager').text(employeeInfo.manager_name || 'Not Assigned');
                    return employeeInfo;
                } else {
                    frappe.show_alert({
                        message: __(r.message?.message || 'Unable to fetch employee details. Please contact HR.'),
                        indicator: 'red'
                    });
                    $('.employee-name').text('Not Available');
                    $('.reporting-manager').text('Not Available');
                }
            }
        });
    };

    const initializeTaskField = ($row) => {
        const $container = $row.find('.task-input-container');
        if ($container.find('.frappe-control').length > 0) {
            return null;
        }

        $container.empty();

        let control = frappe.ui.form.make_control({
            parent: $container,
            df: {
                fieldtype: 'Link',
                options: 'Task',
                fieldname: `task_${Date.now()}`,
                placeholder: 'Select Task',
                get_query: () => ({
                    filters: {
                        'status': ['!=', 'Completed']
                    }
                }),
                only_select: true, // Add this line to disable create
                change: function() {
                    const taskId = this.get_value();
                    if (taskId) {
                        frappe.db.get_value('Task', taskId, ['subject', 'name'], (r) => {
                            if (r && r.subject) {
                                $row.attr('data-task-id', r.name);
                                $row.attr('data-task-name', r.subject);
                                this.set_description(r.subject);
                            }
                        });
                    }
                    updateTotals();
                }
            },
            only_input: false,
            render_input: true,
            doctype: 'Task'
        });

        // Wait for control to be ready
        frappe.after_ajax(() => {
            control.refresh();
            // Disable the create button after control is rendered
            if (control.$input && control.$input_area) {
                control.$input_area.find('.btn-new').hide();
            }
        });

        $container.data('control', control);
        return control;
    };

    // Add this CSS to your existing styles
    $('<style>').prop('type', 'text/css')
        .html(`
            .task-input-container {
                display: flex;
                align-items: center;
            }
            .task-input-container .edit-task {
                padding: 2px 6px;
                color: var(--text-muted);
            }
            .task-input-container input[readonly] {
                background: transparent !important;
                border-color: transparent !important;
                cursor: default;
            }
            [data-theme="dark"] .task-input-container .edit-task {
                color: var(--gray-400);
            }
        `)
        .appendTo('head');

    // Add new helper function definition for appendAddRowButton
    const appendAddRowButton = ($tbody) => {
        let addRowHtml = `
            <tr class="add-row-container">
                <td colspan="9">
                    <div class="text-center">
                        <button class="btn btn-xs btn-default add-row">
                            <i class="fa fa-plus"></i> Add Row
                        </button>
                    </div>
                </td>
            </tr>
        `;
        $tbody.append(addRowHtml);
    };

    const renderBasicStructure = () => {
        let weekStart = timesheetApp.currentDate.clone().startOf('isoWeek');
        let weekEnd = timesheetApp.currentDate.clone().endOf('isoWeek');

        // Update date range display
        $('.date-range').text(`${weekStart.format('MMM DD')} - ${weekEnd.format('MMM DD, YYYY')}`);

        // Update grid dates
        for (let i = 0; i < 7; i++) {
            let day = weekStart.clone().add(i, 'days');
            let $header = $('.timesheet-grid th').eq(i + 1);
            $header.html(`
                ${day.format('ddd')}<br>
                <div class="text-muted small">${day.format('MMM DD')}</div>
            `);
            if (is_weekend(day)) {
                $header.addClass('weekend');
            }
        }

        // Add initial empty row
        let $tbody = $('#timesheet-entries');
        $tbody.empty();
        
        let defaultRow = generateEntryRow({
            date: timesheetApp.currentDate.format('YYYY-MM-DD')
        });
        $tbody.append(defaultRow);

        // Initialize task field and add row button
        initializeTaskField($tbody.find('tr:first'));
        appendAddRowButton($tbody);
    };

    const saveTimesheet = () => {
        if (!employeeInfo || !employeeInfo.name) {
            frappe.throw(__('Employee record not found. Please contact HR.'));
            return;
        }
        
        let weekStart = timesheetApp.currentDate.clone().startOf('isoWeek').format('YYYY-MM-DD');
        let entries = [];
        
        // Collect entries from all visible rows
        $('#timesheet-entries tr').not('.add-row-container').each(function() {
            let $row = $(this);
            let task = $row.find('.task-input-container .frappe-control input').val();
            
            if (!task) return; // Skip rows without tasks
            
            $row.find('.day-cell').each(function() {
                let $cell = $(this);
                let date = $cell.find('.day-hours').data('date');
                let hours = parseFloat($cell.find('.day-hours').val() || $cell.find('.day-hours').attr('value')) || 0;
                let comment = $cell.find('.comment-input').val() || '';
                
                // Only include entries with hours or comments
                if (date && (hours > 0 || comment)) {
                    entries.push({
                        date: date,
                        task: task,
                        hours: hours,
                        comment: comment
                    });
                }
            });
        });

        if (entries.length === 0) {
            frappe.throw(__('Please add at least one time entry'));
            return;
        }

        // Save timesheet
        frappe.call({
            method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.save_timesheet_entry',
            args: {
                week_start: weekStart,
                entries: entries,
                employee: employeeInfo.name
            },
            callback: (r) => {
                if (r.message && r.message.status === "success") {
                    currentTimesheet = r.message.timesheet;
                    
                    // Update UI with saved data
                    if (r.message.data && r.message.data.daily_entries) {
                        r.message.data.daily_entries.forEach(entry => {
                            let $row = $(`.timesheet-grid tr:has(.task-input-container input[value="${entry.task}"])`);
                            if ($row.length) {
                                $row.find(`.day-hours[data-date="${entry.date}"]`).val(entry.hours);
                                $row.find(`.comment-input[data-date="${entry.date}"]`).val(entry.comment);
                            }
                        });
                    }
                    
                    updateTotals();
                    
                    frappe.show_alert({
                        message: __('Timesheet saved successfully'),
                        indicator: 'green'
                    }, 3);
                    updateStatusIndicators('Saved');
                } else {
                    frappe.msgprint(r.message ? r.message.message : __('Could not save timesheet'));
                }
            }
        });
    };

    const submitTimesheet = () => {
        if (!currentTimesheet) {
            frappe.throw(__('Please save the timesheet first'));
            return;
        }

        // Check if timesheet already exists for this week
        let weekStart = timesheetApp.currentDate.clone().startOf('isoWeek').format('YYYY-MM-DD');
        frappe.call({
            method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.check_existing_timesheet',
            args: {
                employee: employeeInfo.name,
                week_start: weekStart
            },
            callback: (r) => {
                if (r.message && r.message.exists) {
                    frappe.throw(__('A timesheet for this week has already been submitted'));
                    return;
                }

                frappe.confirm(
                    __('Are you sure you want to submit this timesheet? This cannot be undone.'),
                    () => {
                        frappe.call({
                            method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.submit_timesheet',
                            args: {
                                timesheet_name: currentTimesheet
                            },
                            callback: (r) => {
                                if (r.message && r.message.status === "success") {
                                    frappe.show_alert({
                                        message: __('Timesheet submitted successfully'),
                                        indicator: 'green'
                                    }, 3);
                                    
                                    // Make all inputs readonly without reloading data
                                    makeTimesheetReadonly();
                                    
                                    // Update status indicators and hide buttons
                                    updateStatusIndicators('Submitted');
                                    $('.btn-save').hide();
                                    $('.add-row, .delete-row').hide();
                                    $('.btn-primary').hide();

                                    // Save the submitted state
                                    currentTimesheet = {
                                        ...currentTimesheet,
                                        docstatus: 1,
                                        status: 'Submitted'
                                    };
                                } else {
                                    frappe.msgprint(__(r.message ? r.message.message : 'Unknown error'));
                                }
                            }
                        });
                    }
                );
            }
        });
    };

    const makeTimesheetReadonly = () => {
        // Disable all inputs and make them readonly
        $('.timesheet-grid input, .timesheet-grid select').prop('readonly', true).prop('disabled', true);
        $('.timesheet-grid .task-input-container input').prop('disabled', true);
        
        // Hide action buttons
        $('.btn-save, .add-row, .delete-row').hide();
        $('.btn-primary').hide();
        
        // Convert comment inputs to text display when readonly
        $('.comment-input').each(function() {
            const comment = $(this).val();
            if (comment) {
                const $display = $(`
                    <div class="comment-display text-muted small">
                        ${frappe.utils.escape_html(comment)}
                    </div>
                `);
                $(this).after($display);
                $(this).hide();
            }
        });
        
        // Add readonly visual indicators
        $('.timesheet-grid').addClass('readonly');
        
        // Add readonly styles if not already added
        if (!$('#readonly-styles').length) {
            $('<style id="readonly-styles">')
                .prop('type', 'text/css')
                .html(`
                    .timesheet-grid.readonly {
                        opacity: 0.9;
                    }
                    .timesheet-grid.readonly input,
                    .timesheet-grid.readonly select {
                        background-color: var(--gray-50) !important;
                        cursor: not-allowed;
                    }
                    .comment-display {
                        padding: 4px 8px;
                        margin-top: 4px;
                        background-color: var(--gray-50);
                        border-radius: 4px;
                    }
                    [data-theme="dark"] .timesheet-grid.readonly input,
                    [data-theme="dark"] .timesheet-grid.readonly select {
                        background-color: var(--gray-800) !important;
                    }
                    [data-theme="dark"] .comment-display {
                        background-color: var(--gray-800);
                    }
                `)
                .appendTo('head');
        }
    };

    // Add new cancel timesheet function
    const cancelTimesheet = () => {
        if (!currentTimesheet) {
            frappe.throw(__('No timesheet to cancel'));
            return;
        }

        frappe.prompt([
            {
                label: __('Cancellation Comment'),
                fieldname: 'comment',
                fieldtype: 'Small Text',
                reqd: 1
            }
        ],
        function(values) {
            frappe.call({
                method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.cancel_timesheet',
                args: {
                    timesheet_name: currentTimesheet,
                    comment: values.comment
                },
                callback: function(r) {
                    if (r.message && r.message.status === "success") {
                        frappe.show_alert({
                            message: __('Timesheet cancelled successfully'),
                            indicator: 'red'
                        }, 3);
                        
                        // Show cancellation info
                        showCancellationInfo(r.message.timesheet);
                        
                        // Reload data
                        loadTimesheetData();
                    } else {
                        frappe.msgprint(__(r.message?.message || 'Could not cancel timesheet'));
                    }
                }
            });
        },
        __('Cancel Timesheet'),
        __('Cancel')
        );
    };

    const showCancellationInfo = (timesheet) => {
        $('.cancellation-info').remove();
        
        if (!timesheet || timesheet.status !== 'Cancelled') return;
        
        let html = `
            <div class="cancellation-info alert alert-danger mb-3">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <div class="cancelled-by font-weight-bold">Cancelled by: ${timesheet.cancelled_by_name || ''}</div>
                        <div class="text-muted">On: ${frappe.datetime.str_to_user(timesheet.cancelled_on)}</div>
                        <div class="mt-2">Comment: ${timesheet.cancellation_comment || ''}</div>
                    </div>
                    <div class="cancellation-status">
                        <span class="indicator-pill red">Cancelled</span>
                    </div>
                </div>
            </div>
        `;
        
        $(html).insertAfter('.summary-section');
    };

    const fetchAndPopulateTimesheet = () => {
        // First fetch holidays
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Holiday",
                parent:"Holiday List",
                filters: [
                    ["holiday_date", "between", [
                        timesheetApp.currentDate.clone().startOf('isoWeek').format('YYYY-MM-DD'),
                        timesheetApp.currentDate.clone().endOf('isoWeek').format('YYYY-MM-DD')
                    ]]
                ],
                fields: ["holiday_date", "description"]
            },
            callback: function(response) {
                holidays = {};
                if (response.message) {
                    response.message.forEach(holiday => {
                        holidays[holiday.holiday_date] = holiday.description;
                    });
                }
               
                // Then fetch timesheet data
                loadTimesheetData();
            }
        });
    };

    const loadTimesheetData = () => {
        let weekStart = timesheetApp.currentDate.clone().startOf('isoWeek').format('YYYY-MM-DD');
        
        // Reset state first
        resetTimesheetState();
        
        frappe.call({
            method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.get_timesheet_for_week',
            args: {
                employee: employeeInfo.name,
                week_start: weekStart
            },
            callback: function(r) {
                if (!r.message) return;

                let $tbody = $('#timesheet-entries');
                if (!$tbody.length) return;

                // Clear existing content
                $tbody.empty();

                // Add default empty row if no timesheet exists
                if (!r.message.timesheet) {
                    let defaultRow = generateEntryRow({
                        date: timesheetApp.currentDate.format('YYYY-MM-DD')
                    });
                    $tbody.append(defaultRow);
                    initializeTaskField($tbody.find('tr:first'));
                    appendAddRowButton($tbody);
                    updateStatusIndicators('Draft');
                    resetApprovalInfo();
                    return;
                }

                // Process existing timesheet
                currentTimesheet = r.message.timesheet.name;
                let entries = r.message.timesheet.daily_entries || [];
                
                // Hide action buttons for regular employees
                if (!isManager(r.message.timesheet.employee)) {
                    hideActionButtons();
                }
                
                // Show approval info only if approved
                if (r.message.timesheet.status === 'Approved') {
                    showApprovalInfo(r.message.timesheet);
                }

                // Make all fields readonly if submitted or approved
                if (r.message.timesheet.docstatus === 1 || r.message.timesheet.status === 'Approved') {
                    makeTimesheetReadonly();
                }

                // Show approve button for managers when timesheet is submitted
                if (isManager(r.message.timesheet.employee) && 
                    r.message.timesheet.status === 'Submitted') {
                    showApproveButton();
                }

                // Group entries by task and date for easier lookup
                let taskGroups = {};
                entries.forEach(entry => {
                    if (!taskGroups[entry.task]) {
                        taskGroups[entry.task] = {
                            date: entry.date,
                            task: entry.task,
                            entries: {}
                        };
                    }
                    taskGroups[entry.task].entries[entry.date] = {
                        hours: entry.hours,
                        comment: entry.description
                    };
                });

                // Generate rows with entry data
                Object.values(taskGroups).forEach(taskData => {
                    let row = generateEntryRow(taskData);
                    let $row = $(row);
                    $tbody.append($row);

                    let control = initializeTaskField($row);
                    if (control) {
                        frappe.after_ajax(() => {
                            control.set_value(taskData.task);
                            updateTotals();
                        });
                    }
                });

                updateTotals();
                updateStatusIndicators(r.message.timesheet.status);

                // Add "Add Row" button only if not readonly and not submitted
                if (r.message.timesheet.docstatus === 0) {
                    appendAddRowButton($tbody);
                }

                // Update submit/cancel button based on status
                if (r.message.timesheet.docstatus === 1) {
                    $('.btn-primary')
                        .removeClass('btn-primary')
                        .addClass('btn-danger')
                        .text('Cancel');
                } else {
                    $('.btn-danger')
                        .removeClass('btn-danger')
                        .addClass('btn-primary')
                        .text('Submit');
                }
            }
        });
    };

    const resetTimesheetState = () => {
        // Reset all state indicators
        $('.indicator-circle').removeClass('active');
        $('.indicator-circle.draft').addClass('active');
        
        // Clear approval info
        resetApprovalInfo();
        
        // Reset buttons
        $('.btn-save').show();
        $('.btn-primary').show().text('Submit').removeClass('btn-danger').addClass('btn-primary');
        
        // Remove readonly state
        $('.timesheet-grid').removeClass('readonly');
        $('.timesheet-grid input, .timesheet-grid select').prop('readonly', false).prop('disabled', false);
        
        // Reset currentTimesheet
        currentTimesheet = null;
    };

    const showApprovalInfo = (timesheet) => {
        if (!$('.approval-info').length) {
            let approvalHtml = `
                <div class="approval-info alert alert-success mb-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="approved-employee text-muted"></div>
                            <div class="approved-by font-weight-bold"></div>
                            <div class="approved-on text-muted"></div>
                            <div class="approval-comment mt-2"></div>
                        </div>
                        <div class="approval-status">
                            <span class="indicator-pill green">Approved</span>
                        </div>
                    </div>
                </div>
            `;
            $('.summary-section').after(approvalHtml);
        }

        $('.approved-employee').text(`Timesheet submitted by: ${timesheet.employee_name}`);
        $('.approved-by').text(`Approved by: ${timesheet.approved_by_name || ''}`);
        $('.approved-on').text(`Approved on: ${frappe.datetime.str_to_user(timesheet.approved_on || '')}`);
        if (timesheet.approval_comment) {
            $('.approval-comment').text(`Comment: ${timesheet.approval_comment}`);
        }
    };

    const resetApprovalInfo = () => {
        $('.approval-info').remove();
    };

    // Define the updateDateRangeDisplay function and store it globally
    timesheetApp.updateDateRange = () => {
        let weekStart = timesheetApp.currentDate.clone().startOf('isoWeek');
        let weekEnd = timesheetApp.currentDate.clone().endOf('isoWeek');
        $('.date-range').text(`${weekStart.format('MMM DD')} - ${weekEnd.format('MMM DD, YYYY')}`);
        
        // Update grid dates
        for (let i = 0; i < 7; i++) {
            let day = weekStart.clone().add(i, 'days');
            let $header = $('.timesheet-grid th').eq(i + 1);
            $header.html(`
                ${day.format('ddd')}<br>
                <div class="text-muted small">${day.format('MMM DD')}</div>
            `);
            if (is_weekend(day)) {
                $header.addClass('weekend');
            } else {
                $header.removeClass('weekend');
            }
        }
        
        // Reload timesheet data for the new date range
        fetchAndPopulateTimesheet();
    };

    // Define renderTimesheet and store it globally
    timesheetApp.renderTimesheet = () => {
        let weekStart = timesheetApp.currentDate.clone().startOf('isoWeek');
        let weekEnd = timesheetApp.currentDate.clone().endOf('isoWeek');

        // Update date range display
        $('.date-range').text(`${weekStart.format('MMM DD')} - ${weekEnd.format('MMM DD, YYYY')}`);

        // Update grid dates
        for (let i = 0; i < 7; i++) {
            let day = weekStart.clone().add(i, 'days');
            let $header = $('.timesheet-grid th').eq(i + 1);
            $header.html(`
                ${day.format('ddd')}<br>
                <div class="text-muted small">${day.format('MMM DD')}</div>
            `);
            if (is_weekend(day)) {
                $header.addClass('weekend');
            } else {
                $header.removeClass('weekend');
            }
        }

        loadTimesheetData();
        fetchAndPopulateTimesheet();
    };

    // Add initializeDatePicker function inside initializeTimesheet
    const initializeDatePicker = () => {
        content.find('.calendar-btn').on('click', function() {
            let dialog = new frappe.ui.Dialog({
                title: __('Select Week'),
                fields: [
                    {
                        fieldname: 'selected_date',
                        fieldtype: 'Date',
                        label: __('Select Date'),
                        default: timesheetApp.currentDate.format('YYYY-MM-DD'),
                        onchange: function() {
                            let date = dialog.get_value('selected_date');
                            let weekStart = moment(date).startOf('isoWeek');
                            let weekEnd = moment(date).endOf('isoWeek');
                            dialog.set_value('week_range', 
                                `<div class="week-range">${weekStart.format('MMM DD')} - ${weekEnd.format('MMM DD, YYYY')}</div>`
                            );
                        }
                    },
                    {
                        fieldname: 'week_range',
                        fieldtype: 'HTML',
                        label: __('Week Range')
                    }
                ],
                primary_action_label: __('Select'),
                primary_action: function() {
                    timesheetApp.currentDate = moment(dialog.get_value('selected_date'));
                    timesheetApp.updateDateRange();
                    dialog.hide();
                }
            });

            // Add some styling to the week range display
            dialog.$wrapper.find('.week-range').css({
                'margin-top': '10px',
                'padding': '5px',
                'background-color': 'var(--bg-light-gray)',
                'border-radius': '4px',
                'text-align': 'center'
            });

            dialog.show();
            // Trigger initial week range display
            dialog.fields_dict.selected_date.df.onchange();
        });
    };

    // Initialize in the correct order
    renderBasicStructure();
    fetchEmployeeInfo();
    initializeDatePicker(); // Now this will be properly defined
    fetchAndPopulateTimesheet();

    // Event handlers
    content.on('click', '.prev-week', function () {
        timesheetApp.currentDate.subtract(1, 'week');
        timesheetApp.renderTimesheet();
    });

    content.on('click', '.next-week', function () {
        timesheetApp.currentDate.add(1, 'week');
        timesheetApp.renderTimesheet();
    });

    content.on('change', '.form-control', function () {
        let hours = parseFloat($(this).val()) || 0;
        if (hours < 0 || hours > 24) {
            frappe.throw(__('Hours must be between 0 and 24'));
            $(this).val(0);
        }
        updateTotals();
    });

    content.on('change', '.day-hours', function () {
        let $row = $(this).closest('tr');
        let date = $row.data('date');
        let hours = parseFloat($(this).val()) || 0;
        let description = $row.find('.description').text();

        if (description.includes('Holiday')) {
            if (is_weekend(date)) {
                $(this).val(0);
            } else {
                $(this).val(8);
            }
            return;
        }

        if (is_weekend(date)) {
            $(this).val(0);
            return;
        }

        if (hours < 0 || hours > 24) {
            frappe.throw(__('Hours must be between 0 and 24'));
            $(this).val(0);
        } else if (hours % 0.5 !== 0) {
            $(this).val(Math.round(hours * 2) / 2);
        }

        updateTotals();
    });

    const createNewRow = (task) => {
        let weekStart = timesheetApp.currentDate.clone().startOf('isoWeek').format('YYYY-MM-DD');
        let $tbody = $('#timesheet-entries');
        
        let newRow = generateEntryRow({
            date: weekStart.format('YYYY-MM-DD'),
            task: task
        });
        
        // Insert new row before the task selector
        $(newRow).insertBefore('.task-selector-row');
        updateTotals();
    };

    // Add new method to populate tasks
    const populateTasks = () => {
        $('.task-input').each(function() {
            let $input = $(this);
            frappe.ui.form.make_control({
                parent: $input.parent(),
                df: {
                    fieldtype: 'Link',
                    options: 'Task',
                    fieldname: 'task',
                    placeholder: 'Select Task',
                    get_query: () => {
                        return {
                            filters: {
                                'status': ['!=', 'Completed']
                            }
                        };
                    }
                },
                render_input: true
            }).then(control => {
                control.$input.val($input.val());
                control.$input.on('change', () => {
                    saveEntry(control.$input);
                });
                $input.replaceWith(control.$input);
            });
        });
    };

    // Add view history button
    const addHistoryButton = () => {
        page.add_menu_item('View History', () => {
            frappe.call({
                method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.get_timesheet_history',
                args: {
                    employee: frappe.defaults.get_user_default("Employee")
                },
                callback: (r) => {
                    if (r.message) {
                        showHistoryDialog(r.message);
                    }
                }
            });
        });
    };

    // Add handler for add row button
    content.on('click', '.add-row', function() {
        let $tbody = $('#timesheet-entries');
        let newRow = generateEntryRow({
            date: timesheetApp.currentDate.format('YYYY-MM-DD'),
            weekday: timesheetApp.currentDate.format('dddd')
        });
        let $newRow = $(newRow);
        $tbody.find('.add-row-container').before($newRow);

        // Initialize task field using the existing function
        initializeTaskField($newRow);
        updateTotals();
    });

    // Update the delete row handler
    content.on('click', '.delete-row', function() {
        let $row = $(this).closest('tr');

        frappe.confirm(
            __('Are you sure you want to delete this entry?'),
            () => {
                $row.remove();
                updateTotals();
                frappe.show_alert({
                    message: __('Entry deleted successfully'),
                    indicator: 'green'
                }, 3);
            }
        );
    });

    // Add custom styles
    $('<style>')
        .prop('type', 'text/css')
        .html(`
            .timesheet-container { padding: 20px; }
            .project-cell { padding: 8px; }
            .project-actions { margin-top: 8px; }
            .table input.form-control { border: none; background: transparent; }
            .totals-row { background-color: #f8f9fa; }
            .progress { background-color: #e9ecef; }
            .weekend { background-color: #f8f9fa; }
            .delete-row { padding: 2px 5px; }
            .delete-row:hover { background-color: #dc3545; color: white; }
            .day-cell { display: flex; flex-direction: column; }
            .comment-input { 
                margin-top: 5px; 
                font-size: 12px; 
                padding: 2px 5px;
                border-top: 1px solid #eee;
             }
            .task-selector-container { padding: 10px 0; }
            .task-name { display: flex; justify-content: space-between; align-items: center; }
            .delete-row { visibility: visible !important; }
            .employee-info {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 4px;
                margin-bottom: 15px;
            }
            .employee-info label {
                font-size: 12px;
                margin-bottom: 2px;
            }

            /* Dark mode styles */
            [data-theme="dark"] .timesheet-container {
                background-color: var(--bg-color);
                color: #ffffff;
            }
            [data-theme="dark"] .table {
                color: #ffffff;
            }
            [data-theme="dark"] .table-bordered td,
            [data-theme="dark"] .table-bordered th {
                border-color: #3e4959;
            }
            [data-theme="dark"] .employee-info,
            [data-theme="dark"] .weekend,
            [data-theme="dark"] .timesheet-status,
            [data-theme="dark"] .comment-display,
            [data-theme="dark"] .task-input-container input {
                background-color: var(--fg-color) !important;
            }
            [data-theme="dark"] .btn-default {
                background-color: var(--fg-color);
                color: #ffffff;
                border-color: #3e4959;
            }
            [data-theme="dark"] .btn-default:hover {
                background-color: var(--bg-color);
            }
            [data-theme="dark"] .comment-input {
                border-top-color: #3e4959;
                background-color: var (--fg-color);
                color: #ffffff;
            }
            [data-theme="dark"] .text-muted {
                color: rgba(255, 255, 255, 0.6) !important;
            }
            [data-theme="dark"] .progress {
                background-color: var(--fg-color);
            }
            [data-theme="dark"] input.form-control {
                color: #ffffff;
                background-color: var (--fg-color) !important;
            }
            [data-theme="dark"] .indicator-separator {
                background: #3e4959;
            }
            [data-theme="dark"] .task-input-container input {
                border-color: #3e4959 !important;
            }
        `)
        .appendTo('head');

    // Initialize everything at once
    $(document).ready(function() {
        fetchEmployeeInfo();
        initializeDatePicker();
        // Remove the populateTasks call
        // frappe.after_ajax(() => {
        //     populateTasks();
        // });

        // Update save button handler
        content.on('click', '.btn-save', function() {
            saveTimesheet();
        });

        // Update add row handler
        content.on('click', '.add-row', function() {
            let $tbody = $('#timesheet-entries');
            let newRow = generateEntryRow({
                date: timesheetApp.currentDate.format('YYYY-MM-DD'),
                weekday: timesheetApp.currentDate.format('dddd')
            });
            let $newRow = $(newRow);
            $tbody.find('.add-row-container').before($newRow);
            initializeTaskField($newRow);
            updateTotals();
        });
    });

    // Add click handlers for save and submit buttons
    content.on('click', '.btn-save', function() {
        saveTimesheet();
    });

    content.on('click', '.btn-primary, .btn-danger', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if ($(this).hasClass('btn-primary')) {
            submitTimesheet();
        } else if ($(this).hasClass('btn-danger')) {
            frappe.confirm(
                __('Are you sure you want to cancel this timesheet?'),
                function() {
                    frappe.call({
                        method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.cancel_timesheet',
                        args: {
                            timesheet_name: currentTimesheet
                        },
                        callback: function(r) {
                            if (r.message && r.message.status === "success") {
                                frappe.show_alert({
                                    message: __('Timesheet cancelled successfully'),
                                    indicator: 'red'
                                });
                                
                                // Reset UI state
                                currentTimesheet = null;
                                $('.btn-danger')
                                    .removeClass('btn-danger')
                                    .addClass('btn-primary')
                                    .text('Submit');
                                $('.btn-save').show();
                                
                                // Reload the data
                                loadTimesheetData();
                            } else {
                                frappe.msgprint(__('Could not cancel timesheet'));
                            }
                        }
                    });
                }
            );
        }
    });

    // Add status indicator HTML after summary section
    const addStatusIndicator = () => {
        let statusHtml = `
            <div class="timesheet-status mb-4">
                <div class="status-indicators d-flex align-items-center">
                    <div class="indicator-item">
                        <span class="indicator-circle draft active"></span>
                        <span class="indicator-label">Draft</span>
                    </div>
                    <div class="indicator-separator"></div>
                    <div class="indicator-item">
                        <span class="indicator-circle saved"></span>
                        <span class="indicator-label">Saved</span>
                    </div>
                    <div class="indicator-separator"></div>
                    <div class="indicator-item">
                        <span class="indicator-circle submitted"></span>
                        <span class="indicator-label">Submitted</span>
                    </div>
                    <div class="indicator-separator"></div>
                    <div class="indicator-item">
                        <span class="indicator-circle approved"></span>
                        <span class="indicator-label">Approved</span>
                    </div>
                </div>
            </div>
        `;
        $('.summary-section').after(statusHtml);
    };

    // Add status styles to the existing styles
    $('<style>')
        .prop('type', 'text/css')
        .html(`
            /* Status indicator styles */
            .timesheet-status {
                padding: 15px;
                border-radius: 4px;
                background: var(--gray-50);
            }
            .status-indicators {
                display: flex;
                justify-content: space-between;
                align-items: center;
                max-width: 600px;
                margin: 0 auto;
            }
            .indicator-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                position: relative;
            }
            .indicator-circle {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: var(--gray-400);
                margin-bottom: 8px;
            }
            .indicator-circle.active {
                background: var(--blue-500);
                box-shadow: 0 0 0 4px rgba(var(--blue-500-rgb), 0.2);
            }
            .indicator-label {
                font-size: 12px;
                color: var(--gray-600);
            }
            .indicator-separator {
                flex-grow: 1;
                height: 2px;
                background: var(--gray-300);
                margin: 0 10px;
                margin-bottom: 25px;
            }
            /* Status-specific colors */
            .indicator-circle.draft.active { background: var(--blue-500); }
            .indicator-circle.saved.active { background: var(--green-500); }
            .indicator-circle.submitted.active { background: var(--yellow-500); }
            .indicator-circle.approved.active { background: var(--green-600); }

            /* Dark mode support */
            [data-theme="dark"] .timesheet-status {
                background: var(--gray-800);
            }
            [data-theme="dark"] .indicator-label {
                color: var(--gray-400);
            }
            [data-theme="dark"] .indicator-separator {
                background: var(--gray-700);
            }
        `)
        .appendTo('head');

    // Update the status indicators based on timesheet state
    const updateStatusIndicators = (status) => {
        $('.indicator-circle').removeClass('active');
        switch(status) {
            case 'Draft':
                $('.indicator-circle.draft').addClass('active');
                break;
            case 'Saved':
                $('.indicator-circle.draft, .indicator-circle.saved').addClass('active');
                break;
            case 'Submitted':
                $('.indicator-circle.draft, .indicator-circle.saved, .indicator-circle.submitted').addClass('active');
                break;
            case 'Approved':
                $('.indicator-circle').addClass('active');
                break;
        }
    };

    // Initialize status indicator on page load
    addStatusIndicator();
    updateStatusIndicators('Draft');
}

const hideActionButtons = () => {
    $('.btn-save, .btn-primary, .btn-danger, .add-row, .delete-row').hide();
};

const isManager = (employeeId) => {
    return frappe.call({
        method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.check_manager_permission',
        args: {
            'employee': employeeId
        },
        callback: (r) => {
            return r.message && r.message.is_manager;
        }
    });
};

const showApproveButton = () => {
    if (!$('.btn-approve').length) {
        let $approveBtn = $(`
            <button class="btn btn-success btn-approve">
                Approve Timesheet
            </button>
        `);
        
        $('.footer-actions').prepend($approveBtn);
        
        $approveBtn.click(() => {
            showApprovalDialog();
        });
    }
};

const showApprovalDialog = () => {
    let dialog = new frappe.ui.Dialog({
        title: __('Approve Timesheet'),
        fields: [{
            label: __('Comment'),
            fieldname: 'comment',
            fieldtype: 'Small Text',
            reqd: true
        }],
        primary_action_label: __('Approve'),
        primary_action: (values) => {
            frappe.call({
                method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.approve_timesheet',
                args: {
                    timesheet_name: currentTimesheet,
                    comment: values.comment
                },
                callback: (r) => {
                    if (r.message && r.message.status === 'success') {
                        frappe.show_alert({
                            message: __('Timesheet approved successfully'),
                            indicator: 'green'
                        });
                        dialog.hide();
                        loadTimesheetData();  // Reload to show updated status
                    } else {
                        frappe.msgprint(r.message.message || __('Could not approve timesheet'));
                    }
                }
            });
        }
    });
};

const showCancelDialog = () => {
    if (!currentTimesheet) {
        frappe.throw(__('No timesheet to cancel'));
        return;
    }

    let d = new frappe.ui.Dialog({
        title: __('Cancel Timesheet'),
        fields: [{
            label: __('Cancellation Comment'),
            fieldname: 'comment',
            fieldtype: 'Small Text',
            reqd: 1
        }],
        primary_action_label: __('Cancel Timesheet'),
        primary_action(values) {
            frappe.call({
                method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.cancel_timesheet',
                args: {
                    timesheet_name: currentTimesheet,
                    comment: values.comment
                },
                callback: function(r) {
                    if (r.message && r.message.status === "success") {
                        d.hide();
                        frappe.show_alert({
                            message: __('Timesheet cancelled successfully'),
                            indicator: 'red'
                        }, 3);
                        
                        // Show cancellation info
                        showCancellationInfo(r.message.timesheet);
                        
                        // Reload the timesheet data
                        loadTimesheetData();
                    } else {
                        frappe.msgprint(__(r.message?.message || 'Could not cancel timesheet'));
                    }
                }
            });
        }
    });
    d.show();
};

const showCancellationInfo = (timesheet) => {
    let html = `
        <div class="alert alert-danger">
            <div class="font-weight-bold">Cancelled by: ${timesheet.cancelled_by_name || ''}</div>
            <div class="text-muted">On: ${frappe.datetime.str_to_user(timesheet.cancelled_on)}</div>
            <div class="mt-2">Comment: ${timesheet.cancellation_comment || ''}</div>
        </div>
    `;
    
    $('.cancellation-info').remove();
    $(html).addClass('cancellation-info mb-4').insertAfter('.summary-section');
};

frappe.ui.form.on('Custom Timesheet', {
    refresh: function(frm) {
        // ...existing code for fetching employee details, approve button, etc...

        // Modify the cancel button action to prompt for a cancellation comment
        if(frm.doc.docstatus === 1 && frm.doc.status !== "Cancelled") {
            frm.add_custom_button(__('Cancel'), function() {
                frappe.prompt([
                    {
                        fieldname: 'comment',
                        label: __('Cancellation Comment'),
                        fieldtype: 'Small Text',
                        reqd: 1
                    }
                ],
                function(values) {
                    frappe.call({
                        method: 'custom_timesheet.custom_timesheet.doctype.custom_timesheet.custom_timesheet.cancel_timesheet',
                        args: {
                            timesheet_name: frm.doc.name,
                            comment: values.comment
                        },
                        callback: function(r) {
                            if (r.message && r.message.status === "success") {
                                frappe.show_alert({
                                    message: __('Timesheet cancelled successfully'),
                                    indicator: 'green'
                                });
                                frm.reload_doc();
                            } else {
                                frappe.msgprint(r.message.message);
                            }
                        }
                    });
                },
                __('Cancel Timesheet'),
                __('Submit'));
            }, __('Actions'));
        }

        // Display cancellation details if timesheet is cancelled
        if (frm.doc.status === "Cancelled") {
            frm.remove_custom_button('Cancel');
            frm.dashboard.clear_headline();
            frm.dashboard.add_indicator(__("Cancelled"), "red");
            if (frm.doc.cancelled_by && frm.doc.cancelled_on) {
                frm.dashboard.add_comment(__("Cancelled by {0} on {1}. Reason: {2}", [
                    frappe.bold(frm.doc.cancelled_by_name || frm.doc.cancelled_by),
                    frappe.datetime.str_to_user(frm.doc.cancelled_on),
                    frm.doc.cancellation_comment || __("No comment")
                ]));
            }
        }

        // ...existing code...
    },
    // ...existing event handlers...
});





