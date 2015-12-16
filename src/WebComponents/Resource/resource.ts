module Vidyano.WebComponents {
    var resources: { [name: string]: Resource } = {};

    export abstract class Resource extends WebComponent {
        private _loadedSource: string;
        name: string;
        source: string;
        model: any;
        hasResource: boolean;

        private _setHasResource: (value: boolean) => void;

        attached() {
            super.attached();

            this._load();
        }

        addAlias(...alias: string[]) {
            alias.forEach(a => resources[`${this.tagName}+${a.toUpperCase()}`] = this);
        }

        private _nameChanged(name: string, oldName: string) {
            if (name)
                resources[`${this.tagName}+${name.toUpperCase()}`] = this;
            else
                delete resources[`${this.tagName}+${oldName.toUpperCase() }`];
        }

        protected get _contentTarget(): Node {
            return this;
        }

        private _load() {
            if (this.source) {
                if (this.source == this._loadedSource)
                    return;

                this.empty(this._contentTarget);

                var resource = Resource.LoadResource(this.source, this.tagName);
                if (resource != null)
                    Polymer.dom(this._contentTarget).appendChild(Resource.Load(resource, this.tagName));

                this._setHasResource(resource != null);
                this._loadedSource = this.source;
            }
        }

        static register(info: WebComponentRegistrationInfo = {}): any {
            if (typeof info == "function")
                return Resource.register({})(info);

            return (obj: Function) => {
                info.properties = info.properties || {};

                info.properties["name"] = {
                    type: String,
                    observer: "_nameChanged"
                };
                info.properties["model"] = {
                    type: Object,
                    observer: "_load"
                };
                info.properties["source"] = {
                    type: String,
                    reflectToAttribute: true,
                    observer: "_load"
                };
                info.properties["hasResource"] = {
                    type: Boolean,
                    reflectToAttribute: true,
                    readOnly: true
                };

                return WebComponent.register(obj, info);
            };
        }

        protected static Load(source: string | Resource, tagName: string): DocumentFragment {
            var resource = (typeof source === "string") ? resources[`${tagName}+${source.toUpperCase() }`] : source;

            var fragment = document.createDocumentFragment();

            Enumerable.from(Polymer.dom(resource).children).forEach((child: HTMLElement) => {
                fragment.appendChild(child.cloneNode(true));
            });

            return fragment;
        }

        protected static LoadResource(source: string, tagName: string): Resource {
            return resources[`${tagName}+${source.toUpperCase() }`];
        }

        protected static Exists(name: string, tagName: string): boolean {
            return resources[`${tagName}+${name.toUpperCase() }`] != undefined;
        }
    }
}