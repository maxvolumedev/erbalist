![Logo](images//erbalist-logo.png)

# ERBalist

ERBalist makes your ERB files easier to work with by reducing visual noise and highlighting relationships between different parts of your code.

When working with ERB templates, your current context matters - are you styling your presentation using Tailwind, writing server-side ruby logic, or refining client-side behaviour using Stimulus and Turbo? ERB mixes all of these concerns - ERBalist helps you detangle them.

Great for modern Rails apps using Hotwire, Stimulus, and Tailwind.

## Features

- **Smart Ruby Focus**: Dims HTML when you're working with Ruby code, letting you focus on control flow
- **Turbo Frame Tracking**: Shows current Turbo Frame scope and related elements referencing the current frame
- **Stimulus Highlighting**: Visualizes controller/target/action/outlet relationships, anywhere in the document
- **Tailwind Class Management**:
  - Folds away those long class strings until you need them
  - Highlights related modifiers (hover:, sm:, dark:, light:md:, etc.) - lets you see at a glance what other classes share the same modifiers
- **SVG Folding**: Fold/unfold all SVG tags in the document - SVG tags can be a bit of a mess, this helps you keep them tucked away if you use them

## Examples

### Ruby Focus
![Ruby Focus](images/examples/ruby.gif)

### Turbo Frame Tracking
![Turbo Frame Tracking](images/examples/turbo.gif)

### Stimulus Highlighting
![Stimulus Highlighting](images/examples/stimulus.gif)

### Tailwind Modifiers
![Tailwind Modifiers](images/examples/tailwind.gif)

### Class Attribute Folding
![Tailwind Class Management](images/examples/class-attributes.gif)

## Extension Settings

This extension contributes the following settings:

* `erbalist.highlightMode`: Controls when Ruby code should be emphasized in ERB templates
  - `always`: Always highlight Ruby code
  - `whenInBlock`: Only highlight Ruby code within Ruby blocks (default)
* `erbalist.toggleWordWrapWithFolding`: Toggle word wrap when folding class attributes (default: false)

## Known Issues

None yet! Please report any issues on GitHub.

## Release Notes

### 1.0.0

Initial release of ERBalist
