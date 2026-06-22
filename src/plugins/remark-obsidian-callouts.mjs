const calloutMarkerPattern = /^\[!([a-z][\w-]*)\]([+-])?[ \t]*/i;

const calloutLabels = {
  abstract: 'Abstract',
  bug: 'Bug',
  caution: 'Caution',
  check: 'Check',
  danger: 'Danger',
  error: 'Error',
  example: 'Example',
  failure: 'Failure',
  faq: 'FAQ',
  help: 'Help',
  hint: 'Hint',
  important: 'Important',
  info: 'Info',
  missing: 'Missing',
  note: 'Note',
  question: 'Question',
  quote: 'Quote',
  success: 'Success',
  summary: 'Summary',
  tip: 'Tip',
  todo: 'Todo',
  warning: 'Warning',
};

export default function remarkObsidianCallouts() {
  return function transform(tree) {
    transformChildren(tree);
  };
}

function transformChildren(parent) {
  if (!Array.isArray(parent.children)) {
    return;
  }

  parent.children = parent.children.map((child) => {
    transformChildren(child);

    if (child.type !== 'blockquote') {
      return child;
    }

    return transformBlockquote(child);
  });
}

function transformBlockquote(blockquote) {
  const firstChild = blockquote.children?.[0];

  if (firstChild?.type !== 'paragraph' || !Array.isArray(firstChild.children)) {
    return blockquote;
  }

  const marker = parseCalloutMarker(firstChild.children);

  if (!marker) {
    return blockquote;
  }

  const { titleNodes, bodyNodes } = splitCalloutBody(marker.inlineNodes);
  const titleChildren = titleNodes.length > 0 ? titleNodes : [{ type: 'text', value: calloutLabels[marker.type] ?? marker.type }];
  const contentChildren = [...bodyNodes, ...blockquote.children.slice(1)];
  const isCollapsible = Boolean(marker.fold);

  if (isCollapsible) {
    return createElementNode('details', createCalloutProperties(marker, ['callout-collapsible'], marker.fold === '+'), [
      createElementNode('summary', { className: ['callout-title'] }, [
        createElementNode('span', { className: ['callout-title-text'] }, titleChildren),
      ]),
      createElementNode('div', { className: ['callout-content'] }, contentChildren),
    ]);
  }

  return createElementNode('aside', createCalloutProperties(marker), [
    createElementNode('div', { className: ['callout-title'] }, [
      createElementNode('span', { className: ['callout-title-text'] }, titleChildren),
    ]),
    createElementNode('div', { className: ['callout-content'] }, contentChildren),
  ]);
}

function parseCalloutMarker(children) {
  if (children[0]?.type !== 'text') {
    return null;
  }

  const match = children[0].value.match(calloutMarkerPattern);

  if (!match) {
    return null;
  }

  const firstText = cloneNode(children[0]);
  firstText.value = firstText.value.slice(match[0].length);
  const inlineNodes = firstText.value ? [firstText, ...cloneNodes(children.slice(1))] : cloneNodes(children.slice(1));

  return {
    type: match[1].toLowerCase(),
    fold: match[2],
    inlineNodes,
  };
}

function splitCalloutBody(inlineNodes) {
  const titleNodes = [];
  const bodyInlineNodes = [];
  let foundBreak = false;

  for (const node of inlineNodes) {
    if (foundBreak) {
      bodyInlineNodes.push(node);
      continue;
    }

    if (node.type === 'break') {
      foundBreak = true;
      continue;
    }

    if (node.type === 'text' && node.value.includes('\n')) {
      const [before, ...afterParts] = node.value.split('\n');

      if (before.trimEnd()) {
        titleNodes.push({ ...node, value: before.trimEnd() });
      }

      const after = afterParts.join('\n').trimStart();

      if (after) {
        bodyInlineNodes.push({ ...node, value: after });
      }

      foundBreak = true;
      continue;
    }

    titleNodes.push(node);
  }

  return {
    titleNodes: trimTextNodes(titleNodes),
    bodyNodes: bodyInlineNodes.length > 0 ? [{ type: 'paragraph', children: trimTextNodes(bodyInlineNodes) }] : [],
  };
}

function createCalloutProperties(marker, extraClassNames = [], open = false) {
  const properties = {
    className: ['callout', `callout-${marker.type}`, ...extraClassNames],
    dataCallout: marker.type,
  };

  if (open) {
    properties.open = true;
  }

  return properties;
}

function createElementNode(tagName, properties, children) {
  return {
    type: `obsidianCallout${capitalize(tagName)}`,
    data: {
      hName: tagName,
      hProperties: properties,
    },
    children,
  };
}

function trimTextNodes(nodes) {
  const trimmed = cloneNodes(nodes);

  while (trimmed[0]?.type === 'text' && trimmed[0].value.trim() === '') {
    trimmed.shift();
  }

  while (trimmed.at(-1)?.type === 'text' && trimmed.at(-1).value.trim() === '') {
    trimmed.pop();
  }

  if (trimmed[0]?.type === 'text') {
    trimmed[0].value = trimmed[0].value.trimStart();
  }

  if (trimmed.at(-1)?.type === 'text') {
    trimmed[trimmed.length - 1].value = trimmed.at(-1).value.trimEnd();
  }

  return trimmed;
}

function cloneNodes(nodes) {
  return nodes.map(cloneNode);
}

function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
