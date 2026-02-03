# Horizon Theme 🌅

**Horizon** is a high-performance, mobile-first Shopify theme built for modern commerce. It follows a unique **Block-First** architecture designed for maximum flexibility and merchant control.

## 🚀 Key Features

- **Block-First Architecture**: Components are split into granular child blocks for infinite layout possibilities.
- **Performance Optimized**: Minimal dependency load, expert use of critical CSS, and native-feeling transitions.
- **Glassmorphism & Rich Aesthetics**: Premium design language out of the box.
- **Responsive & Accessible**: Fully optimized for all device sizes and follows accessibility best practices.

## 🛠 Tech Stack

- **Liquid**: Shopify's templating language.
- **Vanilla CSS**: Scoped styling for performance and maintainability.
- **Vanilla JavaScript**: Lightweight custom elements and interaction logic.
- **Swiper.js**: Powering advanced touch-slider experiences.

## 🏗 Architecture: Block-First

Unlike traditional themes, Horizon prioritizes blocks over sections. Sections act as layout containers, while blocks handle specific content elements (Images, Titles, Buttons, etc.).

- **Sections**: Layout containers (`[section-name].liquid`).
- **Blocks**: Discrete UI components located in the `blocks/` directory.
- **Private Blocks**: Blocks prefixed with `_` are internal components not selectable in the global picker.

## � Mobile-First Philosophy

**Mobile-First** means we design and develop for the smallest screens first, then progressively enhance the experience for larger screens. This approach ensures a lean, performance-oriented foundation.

### How it looks in code
Instead of using `max-width` to "fix" desktop designs for mobile, we use `min-width` to add complexity as the screen grows.

```css
/* 1. Mobile Styles (Default) */
.hero__title {
  font-size: 2rem;
  text-align: center;
}

/* 2. Desktop Enhancements (Progressive) */
@media screen and (min-width: 768px) {
  .hero__title {
    font-size: 4rem;
    text-align: left;
  }
}
```

## �💻 Development Workflow

This project uses the standard Shopify CLI workflow.

### Prerequisites
- [Shopify CLI](https://shopify.dev/themes/tools/cli) installed.
- Access to the Shopify store.

### Commands
```bash
# Start a local development server
shopify theme dev

# Push changes to a specific theme
shopify theme push

# Pull changes from the live theme
shopify theme pull
```

### 🌿 Branch Creation Workflow
Before starting any new feature or fix, follow this exact sequence to ensure consistency between Git and Shopify:

1. **Switch to master**: `git checkout master`
2. **Update Git**: `git pull origin master`
3. **Update from Shopify**: `shopify theme pull`
   - *Note: This ensures changes made directly in the Shopify Admin (Schema settings, etc.) are captured.*
4. **Sync Commit**: If `shopify theme pull` downloaded changes, commit them immediately to master:
   - Message: `chore(sync): sync changes from shopify theme`
   - Command: `git add . && git commit -m "chore(sync): sync changes from shopify theme"`
5. **Create your branch**: Now you are ready to create your branch:
   - `git checkout -b type/short-description`

### 🔄 Merge to Master Workflow
When your work is ready and tested, follow this flow to merge into the main branch:

1. **Commit and Push Branch**: Ensure all work is committed in your feature branch and pushed to the remote.
2. **Switch to master**: `git checkout master`
3. **Sync master with Ground Truth**:
   - `git pull origin master`
   - `shopify theme pull`
   - `git add . && git commit -m "chore(sync): sync changes from shopify theme"` (only if changes were downloaded)
4. **Merge Branch**: `git merge type/short-description`
   - *Resolve any conflicts locally.*
5. **Final Push**:
   - `git push origin master`
   - `shopify theme push` (to update the remote Shopify theme with your merged changes)
6. **Cleanup**: Delete your feature branch locally and remotely to keep the repository clean:
   - `git branch -d type/short-description`
   - `git push origin --delete type/short-description`

---

## 🎨 Style Guidelines

1. **Scoped CSS**: Always scope CSS to the section or block ID to prevent bleeding.
   ```css
   #Banner-{{ section.id }} .banner__content { ... }
   ```
2. **Semantic Schema IDs**: Use descriptive IDs like `heading_size` instead of `text_size`.
3. **I18n**: Use translation keys (`t` syntax) for all schema labels and user-facing text.
4. **Image Handling**: Always use `image_tag` for automatic optimization.
   ```liquid
   {{ image | image_tag: widths: '...', sizes: '...' }}
   ```

## � Git & Commit Standards

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification. **All commit messages MUST be written in English.**

### Format
`<type>(<scope>): <description>`

### Types
- **feat**: A new feature (e.g., `feat(header): add sticky behavior`)
- **fix**: A bug fix (e.g., `fix(cart): resolve drawer overflow`)
- **refactor**: A code change that neither fixes a bug nor adds a feature (e.g., `refactor(blocks): optimize liquid logic`)
- **style**: Formatting, missing semi colons, etc; no code change.
- **docs**: Documentation changes only.
- **perf**: A code change that improves performance.
- **chore**: Maintenance tasks (e.g., updating dependencies).

### Branch Naming
Use the same prefixes for branch names to maintain consistency:
`type/short-description`

- `feat/sticky-header`
- `fix/missing-translations`
- `refactor/cart-logic`

---

## �📁 Structure

- `assets/`: Global JS, CSS, and media.
- `blocks/`: High-level UI components (Block-First entry points).
- `snippets/`: Reusable Liquid components and private code blocks.
- `sections/`: Layout containers and global sections (Header, Footer).
- `locales/`: Translation files for multiple languages.

---

