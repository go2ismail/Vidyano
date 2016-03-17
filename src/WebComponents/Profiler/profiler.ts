module Vidyano.WebComponents {
    var d3timer = <any>d3.timer;
    d3.timer = <any>function(callback, delay, then) {
        d3timer(callback, 0, 0);
    };

    export interface ProfilerServiceRequest extends Vidyano.ServiceRequest {
        hasNPlusOne: boolean;
        parameters: {
            [name: string]: string;
        };
        flattenedEntries: FlattenedServiceRequestProfilerEntry[];
    }

    export interface FlattenedServiceRequestProfilerEntry {
        entry: ServiceRequestProfilerEntry;
        level: number;
    }

    @WebComponent.register({
        properties: {
            service: Object,
            awaiting: {
                type: String,
                value: "Awaiting next request..."
            },
            profiledRequests: {
                type: Array,
                computed: "service.profiledRequests",
                observer: "_profiledRequestsChanged"
            },
            lastRequest: {
                type: Object,
                readOnly: true,
                value: null
            },
            lastRequestParameters: {
                type: Array,
                computed: "_computeLastRequestParameters(lastRequest)"
            },
            selectedRequest: {
                type: Object,
                readOnly: true,
                observer: "_selectedRequestChanged"
            },
            hoveredEntry: {
                type: Object,
                readOnly: true,
                value: null
            },
            selectedEntry: {
                type: Object,
                readOnly: true,
                value: null,
                observer: "_selectedEntryChanged"
            },
            timelineSize: Object,
            zoom: {
                type: Number,
                readOnly: true,
                value: 1
            }
        },
        forwardObservers: [
            "service.profile",
            "service.profiledRequests"
        ],
        observers: [
            "_renderRequestTimeline(selectedRequest, timelineSize, zoom)"
        ]
    })
    export class Profiler extends WebComponent {
        private _boundMousehweel = this._onMousewheel.bind(this);
        lastRequest: ProfilerServiceRequest;
        selectedRequest: ProfilerServiceRequest;
        zoom: number;
        timelineSize: Size;
        profiledRequests: ProfilerServiceRequest[];

        private _setLastRequest: (request: Vidyano.ServiceRequest) => void;
        private _setSelectedRequest: (request: Vidyano.ServiceRequest) => void;
        private _setHoveredEntry: (entry: ServiceRequestProfilerEntry) => void;
        private _setSelectedEntry: (entry: ServiceRequestProfilerEntry) => void;
        private _setZoom: (value: number) => void;

        attached() {
            super.attached();

            this.$["timeline"].addEventListener("DOMMouseScroll", this._boundMousehweel);
        }

        detached() {
            super.detached();

            this.$["timeline"].removeEventListener("DOMMouseScroll", this._boundMousehweel);
        }

        private _computeParameters(request: ProfilerServiceRequest): string {
            if (!request.parameters)
                request.parameters = {};

            switch (request.method) {
                case "GetPersistentObject":
                    return `(${request.parameters["Type"] = request.response.result.type}, ${request.parameters["Id"] = request.response.result.objectId})`;

                case "GetQuery":
                    return `(${request.parameters["Name"] = request.response.query.name})`;

                case "ExecuteAction":
                    return `(${request.parameters["Name"] = request.request.action})`;

                case "ExecuteQuery": {
                    let parameters = `(${request.parameters["Name"] = request.request.query.name}, ${request.parameters["PageSize"] = request.request.query.pageSize}`;
                    if (request.request.query.top)
                        parameters = `${parameters}, ${request.parameters["Top"] = request.request.query.top}`;
                    if (request.request.query.skip)
                        parameters = `${parameters}, ${request.parameters["Skip"] = request.request.query.skip}`;

                    return `${parameters})`;
                }
            }
        }

        private _computeSQL(request: ProfilerServiceRequest): string {
            return request.profiler.sql ? this._formatMs(request.profiler.sql.reduce((current, entry) => current + entry.elapsedMilliseconds, 0)) : "0ms";
        }

        private _computeSharpSQL(request: ProfilerServiceRequest): string {
            return (request.profiler.sql ? request.profiler.sql.length : 0).toString();
        }

        private _computeLastRequestParameters(request: ProfilerServiceRequest): { key: string; value: string; }[] {
            return request ? Enumerable.from(<any>request.parameters).toArray() : [];
        }

        private _isSelected(request: ProfilerServiceRequest, selectedRequest: ProfilerServiceRequest): boolean {
            return request === selectedRequest;
        }

        private _hasWarnings(request: ProfilerServiceRequest): boolean {
            return request.hasNPlusOne || (request.profiler.exceptions && request.profiler.exceptions.length > 0);
        }

        private _hasNPlusOne(request: ServiceRequest, entries: ServiceRequestProfilerEntry[] = request.profiler.entries): boolean {
            if (!entries)
                return false;

            let hasNPlusOne = false;
            entries.forEach(entry => {
                const counts = Enumerable.from(entry.sql).groupBy(commandId => Enumerable.from(request.profiler.sql).firstOrDefault(s => s.commandId == commandId).commandText, s => s);
                if (counts.firstOrDefault(c => c.count() > 1))
                    entry.hasNPlusOne = hasNPlusOne = true;

                if (entry.entries && entry.entries.length > 0)
                    hasNPlusOne = this._hasNPlusOne(request, entry.entries) || hasNPlusOne;
            });

            return hasNPlusOne;
        }

        private _hasSelectedEntry(selectedEntry: ServiceRequestProfilerEntry): boolean {
            return !!selectedEntry;
        }

        private _onMousewheel(e: MouseWheelEvent) {
            const scroller = <Scroller>this.$["timelineScroller"];

            var rect = scroller.getBoundingClientRect();
			var offsetX = e.pageX - rect.left - window.pageXOffset;
            const mousePctg = 1 / scroller.outerWidth * offsetX;

            const isZoomIn = (e.wheelDelta || -e.detail) > 0;
            const newZoom = Math.max(isZoomIn ? this.zoom * 1.1 : this.zoom / 1.1, 1);
            const newInnerWidth = (this.timelineSize.width - 2) * newZoom;

            this._setZoom(newZoom);

            scroller.horizontalScrollOffset = (newInnerWidth - scroller.outerWidth) * mousePctg;
        }

        private _selectRequest(e: TapEvent) {
            this._setSelectedRequest(e.model.request);
        }

        private _selectedRequestChanged() {
            this._setZoom(1);
            this._setSelectedEntry(null);
        }

        private _profiledRequestsChanged(profiledRequests: ProfilerServiceRequest[] = []) {
            profiledRequests.forEach(r => {
                if (r.hasNPlusOne === undefined)
                    r.hasNPlusOne = this._hasNPlusOne(r);
            });

            this._setSelectedRequest(profiledRequests[0]);
            this._setLastRequest(profiledRequests[0]);
        }

        private _renderRequestTimeline(request: ProfilerServiceRequest, size: Size, zoom: number) {
            const width = (size.width - 2) * zoom; // Strip vi-scroller borders
            const headerHeight = parseInt(this.getComputedStyleValue("--vi-profiler-header-height"));
            const entryHeight = parseInt(this.getComputedStyleValue("--vi-profiler-entry-height"));
            const entryLevelGap = parseInt(this.getComputedStyleValue("--vi-profiler-entry-level-gap"));
            const scale = d3.scale.linear().domain([0, request.profiler.elapsedMilliseconds]).range([0, width]);

            const svg = d3.select(this.$["timeline"]).
                attr("width", width).
                attr("height", size.height);

            // Render x-axis
            var xAxis = d3.svg.axis()
                .scale(scale.copy().rangeRound([0, width - 12]))
                .orient("top")
                .tickSize(-size.height, 0)
                .tickFormat(d => this._formatMs(d));

            var xAxisGroup = svg.selectAll('g.xaxis')
                .attr('transform', `translate(0, ${headerHeight})`)
                .call(xAxis);

            xAxisGroup.selectAll("line")
                .attr("stroke-dasharray", "6, 4");

            xAxisGroup.selectAll("text")
                .style("text-anchor", "middle")
                .attr("dy", "-0.5em");

            // Render entries
            let entriesGroup = svg.select(".entries");
            if (entriesGroup.empty())
                entriesGroup = svg.append("g").classed("entries", true);

            const entryGroupSelection = entriesGroup.selectAll("g.entry").data(request.flattenedEntries || (request.flattenedEntries = this._flattenEntries(request.profiler.entries)));
            const entryGroup = entryGroupSelection.enter()
                .append("g")
                .attr("class", e => this._computeEntryClassName(e.entry))
                .on("click", e => this._setSelectedEntry(e.entry));

            entryGroup.append("rect")
                .attr("x", e => scale(e.entry.started || 0))
                .attr("y", e => size.height - (e.level * entryHeight) - (e.level * entryLevelGap))
                .attr("width", e => e.entry.elapsedMilliseconds ? scale(e.entry.elapsedMilliseconds) : 1)
                .attr("height", entryHeight);

            entryGroup
                .append("foreignObject")
                .attr("x", e => scale(e.entry.started || 0))
                .attr("y", e => size.height - (e.level * entryHeight) - (e.level * entryLevelGap))
                .attr("width", e => e.entry.elapsedMilliseconds ? scale(e.entry.elapsedMilliseconds) : 1)
                .attr("height", entryHeight)
                .html(e => `<div class="text" style="width: ${e.entry.elapsedMilliseconds ? scale(e.entry.elapsedMilliseconds) : 1}px;">` + e.entry.methodName + "</div>")
                .on("mouseenter", e => this._setHoveredEntry(e.entry))
                .on("mouseleave", e => this._setHoveredEntry(null));

            const entryGroupTransition = entryGroupSelection.transition().duration(0)
                .attr("class", e => this._computeEntryClassName(e.entry));

            entryGroupTransition
                .select("rect")
                .attr("x", e => scale(e.entry.started || 0))
                .attr("y", e => size.height - (e.level * entryHeight) - (e.level * entryLevelGap))
                .attr("width", e => e.entry.elapsedMilliseconds ? scale(e.entry.elapsedMilliseconds) : 1)
                .attr("height", entryHeight);

            entryGroupTransition.select("foreignObject")
                .attr("x", e => scale(e.entry.started || 0))
                .attr("y", e => size.height - (e.level * entryHeight) - (e.level * entryLevelGap))
                .attr("width", e => e.entry.elapsedMilliseconds ? scale(e.entry.elapsedMilliseconds) : 1)
                .attr("height", entryHeight)
                .select(".text")
                .attr("style", e => `width: ${e.entry.elapsedMilliseconds ? scale(e.entry.elapsedMilliseconds) : 1}px;`)
                .text(e => e.entry.methodName);

            entryGroupSelection.exit().remove();
        }

        private _flattenEntries(entries: ServiceRequestProfilerEntry[] = [], level: number = 1, flattenedEntries: FlattenedServiceRequestProfilerEntry[] = []): FlattenedServiceRequestProfilerEntry[] {
            entries.forEach(entry => {
                flattenedEntries.push({
                    entry: entry,
                    level: level
                });

                this._flattenEntries(entry.entries, level + 1, flattenedEntries);
            });

            return flattenedEntries;
        };

        private _computeEntryClassName(e: ServiceRequestProfilerEntry): string {
            let className = "entry";
            let hasDetails = false;

            if (e.sql && e.sql.length > 0) {
                className = `${className} has-sql`;

                if (e.hasNPlusOne)
                    className = `${className} has-n-plus-one`;

                hasDetails = true;
            }

            if (e.exception)
                className = `${className} has-exception`;

            if (e.arguments)
                hasDetails = true;

            if (hasDetails)
                className = `${className} has-details`;

            return className;
        }

        private _formatMs(ms: number): string {
            return `${ms || 0}ms`;
        }

        private _formatDate(date: Date): string {
            return StringEx.format(`{0:${Vidyano.CultureInfo.currentCulture.dateFormat.shortDatePattern} ${Vidyano.CultureInfo.currentCulture.dateFormat.shortTimePattern}}`, date);
        }

        private _selectedEntryChanged(entry: ServiceRequestProfilerEntry) {
            const info = document.createDocumentFragment();
            this.empty(this.$["selectedEntryInfo"]);

            if (!entry)
                return;

            const createTableCell = (content?: any | HTMLElement, colspan?: number) => {
                var td = document.createElement("td");

                if (content instanceof HTMLElement)
                    td.appendChild(content);
                else
                    td.textContent = <string>content;

                if (colspan)
                    td.setAttribute("colspan", colspan.toString());

                return td;
            };

            const createTableRow = (...contents: (any | HTMLElement)[]) => {
                var row = document.createElement("tr");

                if (contents)
                    contents.forEach(content => row.appendChild(createTableCell(content)));

                return row;
            };

            // Arguments information
            if (entry.arguments && entry.arguments.length > 0) {
                const title = document.createElement("h2");
                title.textContent = "Arguments";
                info.appendChild(title);

                const argumentNames = entry.methodName.replace(")", "").split("(")[1].split(", ");
                const table = document.createElement("table");
                table.className = "arguments";

                argumentNames.forEach((argName, argIndex) => {
                    let row = table.appendChild(document.createElement("tr"));
                    row.appendChild(createTableCell(argName));

                    if (typeof (entry.arguments[argIndex]) == "object") {
                        let first = true;
                        for (let p in entry.arguments[argIndex]) {
                            if (!first) {
                                row = table.appendChild(document.createElement("tr"));
                                row.appendChild(createTableCell());
                            }
                            else
                                first = false;

                            row.appendChild(createTableCell(p));
                            row.appendChild(createTableCell(entry.arguments[argIndex][p]));
                        }
                    }
                    else
                        row.appendChild(createTableCell(entry.arguments[argIndex], 2));
                });

                info.appendChild(table);
            }

            // SQL information
            if (entry.sql  && entry.sql.length > 0) {
                const title = document.createElement("h2");
                title.textContent = "SQL Statements";
                info.appendChild(title);

                const sqlEnum = Enumerable.from(this.selectedRequest.profiler.sql).memoize();
                entry.sql.forEach(sqlCommandId => {
                    var sql = sqlEnum.firstOrDefault(s => s.commandId === sqlCommandId);
                    if (!sql)
                        return;

                    const table = document.createElement("table");
                    table.className = "sql-statement";

                    const commandText = document.createElement("pre");
                    commandText.textContent = sql.commandText;
                    table.appendChild(createTableRow("CommandText", commandText));

                    if (sql.parameters) {
                        const parametersRow = table.appendChild(createTableRow("Parameters"));
                        const parametersTable = document.createElement("table");
                        parametersRow.appendChild(createTableCell(parametersTable));

                        sql.parameters.forEach(sqlParam => parametersTable.appendChild(createTableRow(sqlParam.name, sqlParam.value, sqlParam.type)));

                        table.appendChild(parametersRow);
                    }

                    if (sql.recordsAffected)
                        table.appendChild(createTableRow("Records affected", sql.recordsAffected));

                    table.appendChild(createTableRow("Total time", `${sql.elapsedMilliseconds || 0}ms`));

                    if (sql.taskId)
                        table.appendChild(createTableRow("Task id", sql.taskId));

                    if (entry.hasNPlusOne)
                        table.appendChild(createTableRow("Warning", "Possible N+1 detected"));

                    info.appendChild(table);
                });
            }

            if (entry.exception) {
                const title = document.createElement("h2");
                title.textContent = "Exception";
                info.appendChild(title);

                const exception = Enumerable.from(this.selectedRequest.profiler.exceptions).firstOrDefault(e => e.id == entry.exception);
                if (exception) {
                    const exceptionPre = document.createElement("pre");
                    exceptionPre.textContent = exception.message;
                    info.appendChild(exceptionPre);
                }
            }

            Polymer.dom(this.$["selectedEntryInfo"]).appendChild(info);
        }

        private _closeSelectedEntry() {
            this._setSelectedEntry(null);
        }

        private _close(e: TapEvent) {
            this.app.service.profile = false;

            e.stopPropagation();
        }
    }
}