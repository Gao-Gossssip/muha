import { Script, createContext, runInContext } from 'node:vm';

// Minimal DOM for executing the actual inline browser script, without another dependency.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.dataset = {}; this.value = '';
    this.disabled = false; this.scrollHeight = 0; this.scrollTop = 0; this.clientHeight = 600;
    this._text = ''; this.attributes = new Map();
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...nodes) { this.children.push(...nodes); this.scrollHeight += nodes.length * 20; }
  replaceChildren(...nodes) {
    this._text = ''; this.children = nodes;
    if (this.tagName === 'select' && nodes.length && !nodes.some(node => node.value === this.value)) this.value = nodes[0].value;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  focus() {}
}

export function chatBrowser(html, fetch = () => new Promise(() => {})) {
  const nodes = new Map();
  const document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, new Element(['harness', 'policy'].includes(id) ? 'select' : 'div'));
      return nodes.get(id);
    },
    createElement(tag) { return new Element(tag); },
    querySelector() { return { content: 'controlled-token' }; },
  };
  const context = createContext({ document, fetch, TextDecoder });
  new Script(/<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1]).runInContext(context);
  return { context, document, node: id => document.getElementById(id), evaluate: code => runInContext(code, context) };
}
