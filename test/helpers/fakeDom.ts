/*
 * 화면 모듈 테스트용 최소 DOM 흉내 (브라우저 없이 구조·동작 확인)
 * createElement(NS)·textContent·className·append·replaceChildren·setAttribute·이벤트만 흉내 냅니다.
 */
export class FakeElement {
  tagName: string;
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  listeners = new Map<string, Array<(event: any) => void>>();
  hidden = false;
  parent: FakeElement | null = null;
  [key: string]: any;
  private text = '';
  constructor(tag: string) { this.tagName = tag.toLowerCase(); }
  setAttribute(name: string, value: unknown) { this.attributes.set(name, String(value)); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(value: string) { this.setAttribute('class', value); }
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(''); }
  set textContent(value: string) { this.text = String(value); this.children = []; }
  append(...nodes: Array<FakeElement | string>) {
    for (const node of nodes) {
      const element = typeof node === 'string' ? Object.assign(new FakeElement('#text'), { text: node }) as FakeElement : node;
      element.parent?.remove?.call(element);
      element.parent = this;
      this.children.push(element);
    }
  }
  appendChild(node: FakeElement) { this.append(node); return node; }
  get classList() {
    const names = () => this.className.split(/\s+/).filter(Boolean);
    const write = (list: string[]) => { this.className = list.join(' '); };
    return {
      contains: (name: string) => names().includes(name),
      add: (...add: string[]) => write([...new Set([...names(), ...add])]),
      remove: (...remove: string[]) => write(names().filter((name) => !remove.includes(name))),
      toggle: (name: string, force?: boolean) => { const on = force ?? !names().includes(name); write(on ? [...new Set([...names(), name])] : names().filter((n) => n !== name)); return on; },
    };
  }
  prepend(...nodes: FakeElement[]) { const rest = this.children; this.children = []; this.append(...nodes); this.children.push(...rest); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = null; }
  replaceChildren(...nodes: FakeElement[]) { for (const child of this.children) child.parent = null; this.children = []; this.text = ''; this.append(...nodes); }
  addEventListener(type: string, handler: (event: any) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]); }
  dispatch(type: string, event: any = {}) { for (const handler of this.listeners.get(type) ?? []) handler({ preventDefault() {}, target: this, ...event }); }
  all(): FakeElement[] { return this.children.flatMap((child) => [child, ...child.all()]); }
  find(tag: string, cls?: string) { return this.all().filter((node) => node.tagName === tag && (!cls || node.className.split(/\s+/).includes(cls))); }
}

export function installFakeDocument() {
  (globalThis as any).document = {
    createElement: (tag: string) => new FakeElement(tag),
    createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
  };
}
