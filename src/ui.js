// Small DOM helpers shared by the side panel sections.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Segmented toggle: one button per option, the active one is pressed.
// Options may carry an optional tooltip (`title`).
export function segmentedGroup(container, options, onSelect) {
  const buttons = options.map(({ value, label, title }) => {
    const button = el('button', 'eval-seg-btn', label);
    button.type = 'button';
    button.dataset.value = String(value);
    if (title) button.title = title;
    button.addEventListener('click', () => onSelect(value));
    container.append(button);
    return button;
  });
  return {
    setValue(value) {
      buttons.forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.value === String(value)));
      });
    },
  };
}
