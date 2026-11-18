import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { themes } from '../themes.mjs';
export function extract(css) {
  const ast = postcss.parse(css);
  ast.walkRules(rule => {
    const selectors = selectorParser().astSync(rule.selector);
    const kept = selectors.nodes.filter(selector => {
      const first = selector.nodes[0];
      let valid = first?.type === 'attribute' && first.attribute === 'data-atlas-theme' && first.operator === '=' && themes.includes(first.value);
      selector.walkAttributes(attr => { if (attr.attribute === 'data-atlas-theme' && !themes.includes(attr.value)) valid = false; });
      return valid;
    });
    if (!kept.length) rule.remove();
    else rule.selector = kept.map(s => s.toString().trim()).join(',\n');
  });
  ast.walkComments(c => c.remove());
  ast.walkAtRules(a => { if (!a.nodes || !a.nodes.length || !['media', 'supports', 'layer'].includes(a.name)) a.remove(); });
  return ast.toString().trim();
}
