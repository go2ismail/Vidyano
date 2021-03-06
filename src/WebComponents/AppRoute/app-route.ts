namespace Vidyano.WebComponents {
    "use strict";

    interface IAppRouteComponentConstructor extends HTMLElement {
        new (): IAppRouteComponentConstructor;
    }

    export interface IAppRouteActivatedArgs {
        route: Vidyano.WebComponents.AppRoute;
        parameters: { [key: string]: string };
    }

    @WebComponent.register({
        properties: {
            route: {
                type: String,
                reflectToAttribute: true
            },
            component: {
                type: String,
                reflectToAttribute: true
            },
            active: {
                type: Boolean,
                readOnly: true,
                observer: "_activeChanged"
            },
            path: {
                type: String,
                readOnly: true
            },
            allowSignedOut: Boolean,
            preserveContent: {
                type: Boolean,
                reflectToAttribute: true
            }
        },
        listeners: {
            "title-changed": "_titleChanged"
        }
    })
    export class AppRoute extends WebComponent {
        private _constructor: IAppRouteComponentConstructor;
        private _constructorComponent: string;
        private _constructorChanged: boolean;
        private _hasChildren: boolean;
        private _parameters: { [key: string]: string } = {};
        private _documentTitleBackup: string;
        readonly active: boolean; private _setActive: (val: boolean) => void;
        readonly path: string; private _setPath: (val: string) => void;
        allowSignedOut: boolean;
        deactivator: (result: boolean) => void;
        preserveContent: boolean;

        constructor(public route: string, public component: string) {
            super();
        }

        matchesParameters(parameters: { [key: string]: string } = {}): boolean {
            return this._parameters && JSON.stringify(this._parameters) === JSON.stringify(parameters);
        }

        async activate(parameters: { [key: string]: string } = {}): Promise<any> {
            if (this.active && this.matchesParameters(parameters))
                return;

            this._documentTitleBackup = document.title;
            this._parameters = parameters;

            if (this.preserveContent && Polymer.dom(this).children.length > 0)
                this._fireActivate(<WebComponent>Polymer.dom(this).children[0]);
            else {
                this._clearChildren();

                if (this.component) {
                    if (this._constructorComponent !== this.component) {
                        this._constructor = this._constructorFromComponent(this.component);
                        if (!this._constructor) {
                            if (!this._constructor && this.component.startsWith("Vidyano.WebComponents.")) {
                                const component = this.component;

                                await this.app.importComponent(this.component.replace(/^(Vidyano.WebComponents.)/, ""));
                                if (this.component !== component || (this._parameters && JSON.stringify(this._parameters) !== JSON.stringify(parameters)))
                                    return;

                                this._constructor = this._constructorFromComponent(this.component);
                                if (this._constructor) {
                                    this._constructorComponent = this.component;
                                    this._distributeNewComponent();
                                }
                            }
                        }
                        else {
                            this._constructorComponent = this.component;
                            this._distributeNewComponent();
                        }
                    }
                    else
                        this._distributeNewComponent();
                }
                else {
                    const template = <PolymerTemplate><any>Polymer.dom(this).querySelector("template[is='dom-template']");
                    if (template) {
                        Polymer.dom(this).appendChild(template.stamp({ app: this.app }).root);
                        Polymer.dom(this).flush();

                        this._hasChildren = true;
                    }
                    else {
                        const firstChild = <WebComponent>Polymer.dom(this).children[0];
                        if (firstChild) {
                            if (firstChild.updateStyles)
                                firstChild.updateStyles();

                            this._fireActivate(firstChild);
                        }
                    }
                }
            }

            this._setActive(true);
            this._setPath(this.app.path);

            (<AppServiceHooks>this.app.service.hooks).trackPageView(this.app.path);
        }

        private _constructorFromComponent(component: string): IAppRouteComponentConstructor {
            return <IAppRouteComponentConstructor><any>this.component.split(".").reduce((obj: any, path: string) => obj[path], window);
        }

        private _distributeNewComponent() {
            if (!this._constructor || this._constructorComponent !== this.component)
                return;

            this._clearChildren();

            const componentInstance = <WebComponent><any>new this._constructor();
            Polymer.dom(this).appendChild(componentInstance);
            Polymer.dom(this).flush();

            this._hasChildren = true;

            this._fireActivate(componentInstance);
        }

        private _fireActivate(target: WebComponent) {
            if (target.fire)
                target.fire("app-route-activate", { route: this, parameters: this._parameters }, { bubbles: true });
        }

        private _clearChildren() {
            if (!this._hasChildren)
                return;

            Polymer.dom(this).children.filter(c => c.tagName !== "TEMPLATE" && c.getAttribute("is") !== "dom-template").forEach(c => Polymer.dom(this).removeChild(c));
            this._hasChildren = false;
        }

        deactivate(nextRoute?: AppRoute): Promise<boolean> {
            const component = <WebComponent>Polymer.dom(this).children[0];

            return new Promise<boolean>(resolve => {
                this.deactivator = resolve;
                if (!component || !component.fire || !component.fire("app-route-deactivate", null, { bubbles: false, cancelable: true }).defaultPrevented)
                    resolve(true);
            }).then(result => {
                if (result) {
                    if (!this.preserveContent || nextRoute !== this)
                        this._setActive(false);

                    document.title = this._documentTitleBackup;
                }

                return result;
            });
        }

        reset() {
            this._setActive(false);

            if (!this._constructor)
                return;

            this._clearChildren();
        }

        get parameters(): any {
            return this._parameters;
        }

        private _activeChanged() {
            this.toggleClass("active", this.active);

            if (this.activate)
                this.fire("app-route-activated", null);
            else
                this.fire("app-route-deactivated", null);
        }

        private _titleChanged(e: CustomEvent, detail: { title: string; }) {
            if (!this.active || this.app.noHistory || e.defaultPrevented || Polymer.dom(e.srcElement || <Node>e.target).parentNode !== this)
                return;

            if (this._documentTitleBackup !== detail.title && !!detail.title)
                document.title = `${detail.title} · ${this._documentTitleBackup}`;
            else
                document.title = this._documentTitleBackup;

            e.stopPropagation();
        }
    }
}