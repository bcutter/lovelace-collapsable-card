console.log(`%ccollapsable-card\n%cVersion: ${"0.0.1-HistoryPatch-2026-01-08-DynHeight"}`, "color: rebeccapurple; font-weight: bold;", "");

class CollapsableCard extends HTMLElement {
  constructor() {
    super();
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

    this.expand_upward = config.expand_upward === true;
    this.show_icon = config.show_icon !== false;
    this.show_head = config.head !== undefined;
    this.content_alignment = alignments[config.content_alignment] || "space-between";
    this.button_padding = config.button_padding !== undefined ? config.button_padding : (this.show_head ? "0px" : "16px");
    this.content_padding = config.content_padding !== undefined ? config.content_padding : "8px";
    this.card_margin = config.card_margin !== undefined ? config.card_margin : "0";

    this._config = config;
    this._refCards = [];
    this.renderCard();
  }

  async renderCard() {
    const config = this._config;
    if (window.loadCardHelpers) this.helpers = await window.loadCardHelpers();

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
    this.cardList.className = "card-list-" + this.id;
    cardList.style.overflow = "hidden";

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

    // Wenn contain-toggled, Button automatisch klicken
    if (config.defaultOpen === "contain-toggled" && config.cards.filter((c) => this.checkActiveCard(c)).length > 0) {
      toggleButton.click();
    }

    // Direkt nach Render Höhe setzen, falls geöffnet
    if (this.isToggled) this.updateCardHeight();
  }

  checkActiveCard(card) {
    const containers = ["grid", "vertical-stack", "horizontal-stack"];
    return containers.includes(card.type)
      ? card.cards.filter((c) => this.checkActiveCard(c)).length > 0
      : this._hass.states[card.entity]?.state !== "off";
  }

  createToggleButton() {
    const toggleButton = document.createElement("button");
    if (this.show_head) toggleButton.appendChild(this.head);
    else if (this._config.expand_text && !this.isToggled) toggleButton.innerHTML = this._config.expand_text;
    else if (this._config.collapse_text && this.isToggled) toggleButton.innerHTML = this._config.collapse_text;
    else toggleButton.innerHTML = this._config.title || "Toggle";

    toggleButton.className = "card-content toggle-button-" + this.id;
    if (!this.show_head) toggleButton.addEventListener("click", () => {
      this.isToggled = !this.isToggled;
      this.styleCard(this.isToggled);
    });

    if (this.show_icon) {
      const icon = document.createElement("ha-icon");
      icon.className = "toggle-button__icon-" + this.id;
      icon.setAttribute("icon", this.expand_upward ? "mdi:chevron-up" : "mdi:chevron-down");
      if (this.show_head) icon.addEventListener("click", () => {
        this.isToggled = !this.isToggled;
        this.styleCard(this.isToggled);
      });
      this.icon = icon;
      toggleButton.appendChild(icon);
    }

    this.toggleButton = toggleButton;
    return toggleButton;
  }

  styleCard(isToggled) {
    if (isToggled) this.updateCardHeight();
    else this.cardList.style.height = "0px";

    // Icon + Text
    if (this.show_icon) {
      const openIcon = this.expand_upward ? "mdi:chevron-up" : "mdi:chevron-down";
      const closeIcon = this.expand_upward ? "mdi:chevron-down" : "mdi:chevron-up";
      this.icon.setAttribute("icon", isToggled ? closeIcon : openIcon);
    }
    if (this._config.expand_text || this._config.collapse_text) {
      this.toggleButton.innerHTML = isToggled ? this._config.collapse_text : this._config.expand_text;
      if (this.show_icon) this.toggleButton.appendChild(this.icon);
    }

    // Resize events für Charts etc.
    [0,50,250].forEach((t) => setTimeout(() => window.dispatchEvent(new Event("resize")), t));
  }

  updateCardHeight() {
    // dynamische Höhe anhand des Inhalts
    const scrollHeight = this.cardList.scrollHeight;
    this.cardList.style.height = scrollHeight + "px";
  }

  async createCardElement(cardConfig) {
    const createError = (error, origConfig) => {
      return createThing("hui-error-card", { type: "error", error, origConfig });
    };

    const createThing = (tag, config) => {
      if (this.helpers) {
        if (config.type === "divider") return this.helpers.createRowElement(config);
        else return this.helpers.createCardElement(config);
      }
      const element = document.createElement(tag);
      try { element.setConfig(config); } catch (err) { console.error(tag, err); return createError(err.message, config); }
      return element;
    };

    let tag = cardConfig.type;
    if (tag.startsWith("divider")) tag = `hui-divider-row`;
    else if (tag.startsWith("custom:")) tag = tag.substr("custom:".length);
    else tag = `hui-${tag}-card`;

    const element = createThing(tag, cardConfig);
    element.hass = this._hass;
    element.addEventListener("ll-rebuild", (ev) => {
      ev.stopPropagation();
      this.createCardElement(cardConfig).then(() => this.renderCard());
    }, { once: true });

    return element;
  }

  set hass(hass) {
    this._hass = hass;
    if (this._refCards) this._refCards.forEach((card) => { card.hass = hass; });
    if (this.head) this.head.hass = hass;
  }

  _computeCardSize(card) {
    if (typeof card.getCardSize === "function") return card.getCardSize();
    return customElements.whenDefined(card.localName).then(() => this._computeCardSize(card)).catch(() => 1);
  }

  async getCardSize() {
    await this._cardSize.promise;
    const sizes = await Promise.all(this._refCards.map(this._computeCardSize));
    return sizes.reduce((a, b) => a + b);
  }

  getStyles() {
    return `
      .head-card-${this.id} { grid-column: 1; grid-row: 1; }
      .toggle-button-${this.id} {
        color: var(--primary-text-color);
        text-align: left;
        background: var(--card-background-color);
        border: none;
        display: ${this.show_head ? "grid" : "flex"};
        justify-content: ${this.content_alignment};
        align-items: center;
        width: 100%;
        padding: ${this.button_padding};
        border-radius: var(--ha-card-border-radius, 4px);
        cursor: pointer;
        ${this._config.buttonStyle || ""}
      }
      .toggle-button-${this.id}:focus { outline: none; }
      .card-list-${this.id} {
        overflow: hidden;
        height: 0px;
        transition: height 0.3s ease;
      }
      .toggle-button__icon-${this.id} {
        color: var(--paper-item-icon-color, #aaa);
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
