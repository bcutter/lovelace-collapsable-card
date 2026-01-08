console.log(`%ccollapsable-card\n%cVersion: ${"0.0.1-HistoryPatch-2026-01-08-FixHeight"}`, "color: rebeccapurple; font-weight: bold;", "");

class CollapsableCard extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    // Sicherstellen, dass Toggle/Style erst nach DOM hängt
    requestAnimationFrame(() => {
      if (this._refCards && this.isToggled) {
        this.styleCard(true);
      }
    });
  }

  setConfig(config) {
    const alignments = {
      left: "left",
      center: "center",
      right: "right",
      justify: "space-between",
      even: "space-even",
    };
    this.id = Math.round(Math.random() * 10000);
    this._cardSize = {};
    this._cardSize.promise = new Promise((resolve) => (this._cardSize.resolve = resolve));

    if (!config || !config.cards || !Array.isArray(config.cards)) {
      throw new Error("Supply the `cards` property");
    }

    let isMobile = window.matchMedia("only screen and (max-width: 760px)").matches;
    if (config.defaultOpen == true) {
      this.isToggled = true;
    } else if (config.defaultOpen == "desktop-only" && !isMobile) {
      this.isToggled = true;
    } else {
      this.isToggled = false;
    }

    this.expand_upward = config.expand_upward ?? false;
    this.show_icon = config.show_icon ?? true;
    this.show_head = config.head !== undefined;
    this.content_alignment = alignments[config.content_alignment] ?? undefined;
    this.button_padding = config.button_padding ?? (this.show_head ? "0px" : "16px");
    this.content_padding = config.content_padding ?? "8px";
    this.card_margin = config.card_margin ?? "0";

    this._config = config;
    this._refCards = [];
    this.renderCard();
  }

  async renderCard() {
    const config = this._config;
    if (window.loadCardHelpers) {
      this.helpers = await window.loadCardHelpers();
    }

    if (this.show_head) {
      this.head = await this.createCardElement(config.head);
      this.head.className = "head-card-" + this.id;
    }

    const promises = config.cards.map((cfg) => this.createCardElement(cfg));
    this._refCards = await Promise.all(promises);

    const card = document.createElement("ha-card");
    this.card = card;
    const cardList = document.createElement("div");
    this.cardList = cardList;
    card.style.overflow = "hidden";
    this._refCards.forEach((c) => cardList.appendChild(c));
    cardList.className = "card-list-" + this.id;
    cardList.classList[this.isToggled ? "add" : "remove"]("is-toggled");

    const toggleButton = this.createToggleButton();

    if (this.expand_upward) {
      card.appendChild(cardList);
      card.appendChild(toggleButton);
    } else {
      card.appendChild(toggleButton);
      card.appendChild(cardList);
    }

    while (this.hasChildNodes()) this.removeChild(this.lastChild);
    this.appendChild(card);

    this._cardSize.resolve();

    const styleTag = document.createElement("style");
    styleTag.innerHTML = this.getStyles();
    card.appendChild(styleTag);

    if (config.defaultOpen === "contain-toggled" && config.cards.filter((c) => this.checkActiveCard(c)).length > 0) {
      toggleButton.click();
    }
  }

  checkActiveCard(card) {
    const containers = ["grid", "vertical-stack", "horizontal-stack"];
    return containers.includes(card.type)
      ? card.cards.filter((c) => this.checkActiveCard(c)).length > 0
      : this._hass.states[card.entity]?.state !== "off";
  }

  createToggleButton() {
    const toggleButton = document.createElement("button");
    if (this.show_head) {
      toggleButton.appendChild(this.head);
    } else if (this._config.expand_text && !this.isToggled) {
      toggleButton.innerHTML = this._config.expand_text;
    } else if (this._config.collapse_text && this.isToggled) {
      toggleButton.innerHTML = this._config.collapse_text;
    } else {
      toggleButton.innerHTML = this._config.title || "Toggle";
    }
    toggleButton.className = "card-content toggle-button-" + this.id;

    if (!this.show_head) {
      toggleButton.addEventListener("click", () => {
        this.isToggled = !this.isToggled;
        this.styleCard(this.isToggled);
      });
    }

    if (this.show_icon) {
      const icon = document.createElement("ha-icon");
      icon.className = "toggle-button__icon-" + this.id;
      icon.setAttribute("icon", this.expand_upward ? "mdi:chevron-up" : "mdi:chevron-down");
      if (this.show_head) {
        icon.addEventListener("click", () => {
          this.isToggled = !this.isToggled;
          this.styleCard(this.isToggled);
        });
      }
      this.icon = icon;
      toggleButton.appendChild(icon);
    }

    this.toggleButton = toggleButton;
    return toggleButton;
  }

  styleCard(isToggled) {
    this.cardList.classList[isToggled ? "add" : "remove"]("is-toggled");

    if (this.show_icon) {
      const openIcon = this.expand_upward ? "mdi:chevron-up" : "mdi:chevron-down";
      const closeIcon = this.expand_upward ? "mdi:chevron-down" : "mdi:chevron-up";
      this.icon.setAttribute("icon", isToggled ? closeIcon : openIcon);
    }

    if (this._config.expand_text || this._config.collapse_text) {
      this.toggleButton.innerHTML = isToggled ? this._config.collapse_text : this._config.expand_text;
      if (this.show_icon) this.toggleButton.appendChild(this.icon);
    }

    // Robust refresh
    if (isToggled) {
      [0, 50, 250].forEach((t) =>
        setTimeout(() => window.dispatchEvent(new Event("resize")), t)
      );

      try {
        const children = Array.from(this.cardList.querySelectorAll("*"));
        children.forEach((el) => {
          if (el?.updateComplete instanceof Promise) {
            el.updateComplete.then(() => window.dispatchEvent(new Event("resize"))).catch(() => {});
          }
          ["rebuild", "updateChart", "refresh", "recalculate", "renderChart"].forEach((m) => {
            if (el && typeof el[m] === "function") {
              try { el[m](); } catch (e) {}
            }
          });
        });
      } catch (e) {}
    }
  }

  async createCardElement(cardConfig) {
    const createError = (error, origConfig) => {
      return createThing("hui-error-card", { type: "error", error, origConfig });
    };

    const createThing = (tag, config) => {
      if (this.helpers) {
        if (config.type === "divider") return this.helpers.createRowElement(config);
        return this.helpers.createCardElement(config);
      }
      const element = document.createElement(tag);
      try { element.setConfig(config); } catch (err) { console.error(tag, err); return createError(err.message, config); }
      return element;
    };

    let tag = cardConfig.type.startsWith("divider") ? "hui-divider-row"
      : cardConfig.type.startsWith("custom:") ? cardConfig.type.substr("custom:".length)
      : `hui-${cardConfig.type}-card`;

    const element = createThing(tag, cardConfig);
    element.hass = this._hass;
    element.addEventListener("ll-rebuild", (ev) => { ev.stopPropagation(); this.createCardElement(cardConfig).then(()=>this.renderCard()); }, { once: true });
    return element;
  }

  set hass(hass) {
    this._hass = hass;
    this._refCards?.forEach((card) => { card.hass = hass; });
    if (this.head) this.head.hass = hass;
  }

  _computeCardSize(card) {
    if (typeof card.getCardSize === "function") return card.getCardSize();
    return customElements.whenDefined(card.localName).then(() => this._computeCardSize(card)).catch(() => 1);
  }

  async getCardSize() {
    await this._cardSize.promise;
    const sizes = await Promise.all(this._refCards.map(this._computeCardSize));
    return sizes.reduce((a, b) => a + b, 0);
  }

  getStyles() {
    return `
      .head-card-${this.id} { grid-column: 1; grid-row: 1; }

      .toggle-button-${this.id} {
        color: var(--primary-text-color);
        text-align: left;
        background: var(--card-background-color);
        border: none;
        margin-top: ${this.expand_upward && this.isToggled ? `0;` : `${this.card_margin};`}
        margin-bottom: ${!this.expand_upward && this.isToggled ? `0;` : `${this.card_margin};`}
        display: ${this.show_head ? "grid" : "flex"};
        justify-content: ${this.content_alignment ?? "space-between"};
        align-items: center;
        width: 100%;
        padding: ${this.button_padding};
        border-radius: var(--ha-card-border-radius, 4px);
        cursor: pointer;
        ${this.show_head ? "align-self: start;" : ""}
        ${this._config.buttonStyle || ""}
      }
      .toggle-button-${this.id}:focus { outline: none; background-color: var(--card-background-color); }

      /* --- alte Höhe-Logik zurück --- */
      .card-list-${this.id} {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: 0;
        padding: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        clip-path: inset(50%);
        border: 0;
        white-space: nowrap;
      }
      .card-list-${this.id}.is-toggled {
        position: unset;
        width: unset;
        height: unset;
        margin: unset;
        ${this.expand_upward ? `margin-top: ${this.card_margin};` : `margin-bottom: ${this.card_margin};`}
        padding: unset;
        overflow: unset;
        clip: unset;
        clip-path: unset;
        border: unset;
        white-space: unset;
        ${this.show_head ? "" : this.expand_upward ? `padding-bottom: ${this.content_padding};` : ""}
        ${this.show_head ? "" : this.expand_upward ? "" : `padding-top: ${this.content_padding};`}
      }

      .toggle-button__icon-${this.id} {
        color: var(--paper-item-icon-color, #aaa);
        ${this.show_head ? "grid-column: 1;" : ""}
        ${this.show_head ? "grid-row: 1;" : ""}
        ${this.show_head ? "position: absolute;" : ""}
        ${this.show_head ? "top: 16px;" : ""}
        ${this.show_head ? "right: 16px;" : ""}
      }

      .type-custom-collapsable-card { background: transparent; }
    `;
  }
}

customElements.define("collapsable-card", CollapsableCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "collapsable-card",
  name: "Collapsable Card",
  preview: false,
  description: "The Collapsable Card allows you to hide other cards behind a dropdown toggle.",
});
