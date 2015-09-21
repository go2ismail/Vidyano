﻿module Vidyano.WebComponents {
    @Dialog.register({
        properties: {
            grid: Object,
            _columnElements: {
                type: Object,
                readOnly: true
            }
        },
        listeners: {
            "distribute-columns": "_distributeColumns",
            "reorder-columns": "_reorderColumns"
        }
    })
    export class QueryGridConfigureDialog extends Dialog {
        private _columnElements: QueryGridConfigureDialogColumn[];
        private _set_columnElements: (columns: QueryGridConfigureDialogColumn[]) => void;

        constructor(public grid: QueryGrid, private _settings: QueryGridUserSettings) {
            super();

            this._set_columnElements(this._settings.columns.filter(c => c.width != "0").map(c => new Vidyano.WebComponents.QueryGridConfigureDialogColumn(c)));
            this._distributeColumns();
        }

        private _distributeColumns(e?: CustomEvent) {
            var columns = Enumerable.from(this._columnElements).orderBy(c => c.column.offset).memoize();

            requestAnimationFrame(() => {
                this._updateColumns(this.$["pinned"], columns.where(c => c.isPinned).toArray());
                this._updateColumns(this.$["unpinned"], columns.where(c => !c.isPinned).toArray());
            });

            if (e)
                e.stopPropagation();
        }

        private _updateColumns(target: HTMLElement, columns: QueryGridConfigureDialogColumn[]) {
            columns.forEach(col => target.appendChild(col));
        }

        private _reorderColumns(e: CustomEvent) {
            var children = <QueryGridConfigureDialogColumn[]>Polymer.dom(e.srcElement).children;
            var offsets = Enumerable.from(children).orderBy(c => c.column.offset).select(c => c.column.offset).toArray();

            children.forEach((child: QueryGridConfigureDialogColumn, index: number) => {
                child.offset = offsets[index];
            });

            e.stopPropagation();
        }

        private _save() {
            this._columnElements.forEach(c => {
                c.column.isPinned = c.isPinned;
                c.column.isHidden = c.isHidden;
                c.column.offset = c.offset;
            });

            this._settings.save().then(() => {
                this.instance.resolve();
            });
        }

        private _reset() {
            this._columnElements.forEach(c => {
                c.isPinned = c.column.isPinned = c.column.column.isPinned;
                c.isHidden = c.column.isHidden = c.column.column.isHidden;
                c.offset = c.column.offset = c.column.column.offset;
            });

            this._distributeColumns();
        }
    }

    @Sortable.register({
        extends: "ul"
    })
    export class QueryGridConfigureDialogColumnList extends Sortable {
        protected _dragEnd() {
            this.fire("reorder-columns", {}, { bubbles: true });
        }
    }

    @WebComponent.register({
        extends: "li",
        properties: {
            column: Object,
            isPinned: {
                type: Boolean,
                reflectToAttribute: true
            },
            isHidden: {
                type: Boolean,
                reflectToAttribute: true
            }
        }
    })
    export class QueryGridConfigureDialogColumn extends WebComponent {
        offset: number;
        isPinned: boolean;
        isHidden: boolean;

        constructor(public column: QueryGridColumn) {
            super();

            this.offset = this.column.offset;
            this.isPinned = this.column.isPinned;
            this.isHidden = this.column.isHidden;
        }

        private _togglePin() {
            this.isPinned = !this.isPinned;

            this.fire("distribute-columns", {}, { bubbles: true });
        }

        private _toggleVisible() {
            this.isHidden = !this.isHidden;
        }
    }
}