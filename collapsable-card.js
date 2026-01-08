console.log(
  "%ccollapsable-card\n%cVersion: %s",
  "color: rebeccapurple; font-weight: bold;",
  "",
  "0.0.1-HistoryPatch-2026-01-08-FINAL"
);

class CollapsableCard extends HTMLElement {
  constructor() {
    super();
    this.id = Math.round(Math.random() * 10000);
    this._cardSize = {};
    this._cardSize.promise = new Promise((resolve) => (this._cardSize.resolve = resolve));
    this._refCards = [];
    this._mutationObserver = null;
    this._resizeObserver = null;
    this.isToggled = false;
    this.expand_upward = false;
    this.show_icon = true;
    this.show_head = false;
    this._config = {};
  }

  connectedCallback() {
    // Ensure styleCard runs after element is connected and DOM settled
    requestAnimationFrame(() => {
      if (this._refCards && this.isToggled) {
        // call styleCard to ensure height is correct if defaultOpen was true
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

    if (!config || !config.cards || !Array.isArray(config.cards)) {
      throw new Error("Supply the `cards` property");
    }

    // preserve randomness id if already set by constructor
    this.id = this.id || Math.round(Math.random() * 10000);

    // defaultOpen handling
    const isMobile = window.matchMedia("only screen and (max-width: 760px)").matches;
    if (config.defaultOpen === true) this.isToggled = true;
    else if (config.defaultOpen === "desktop-only" && !isMobile) this.isToggled = true;
    else this.isToggled = false;

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

  /* ---------- Render / build ---------- */
  async renderCard() {
    const config = this._config;
    if (window.loadCardHelpers) {
      try {
        this.helpers = await window.loadCardHelpers();
      } catch (e) {
        // ignore
      }
    }

    // head (optional)
    if (this.show_head) {
      this.head = await this.createCardElement(config.head);
      this.head.className = "head-card-" + this.id;
    } else {
      this.head = undefined;
    }

    // create children cards
    const promises = config.cards.map((c) => this.createCardElement(c));
    this._refCards = await Promise.all(promises);

    // build DOM
    const card = document.createElement("ha-card");
    this.card = card;
    const cardList = document.createElement("div");
    this.cardList = cardList;
    card.style.overflow = "hidden";

    // append children into cardList
    this._refCards.forEach((c) => cardList.appendChild(c));
    cardList.className = "card-list-" + this.id;
    cardList.style.overflow = "hidden";
    cardList.style.height = this.isToggled ? "auto" : "0px";

    // toggle button
    const toggleButton = this.createToggleButton();

    if (this.expand_upward) {
      card.appendChild(cardList);
      card.appendChild(toggleButton);
    } else {
      card.appendChild(toggleButton);
      card.appendChild(cardList);
    }

    // replace content
    while (this.hasChildNodes()) this.removeChild(this.lastChild);
    this.appendChild(card);

    // resolve cardSize once built
    this._cardSize.resolve();

    // attach styles
    const styleTag = document.createElement("style");
    styleTag.innerHTML = this.getStyles();
    card.appendChild(styleTag);

    // after rendering, set up observers to react to children size changes
    this.setupObservers();

    // if defaultOpen contained active card config -> toggle
    if (config.defaultOpen === "contain-toggled" && config.cards.filter((c) => this.checkActiveCard(c)).length > 0) {
      toggleButton.click();
    }

    // if already toggled, ensure correct measured height
    if (this.isToggled) {
      // give children a moment to initialize, then measure
      this.updateCardHeight(true).catch(()=>{});
    }
  }

  checkActiveCard(card) {
    const containers = ["grid", "vertical-stack", "horizontal-stack"];
    return containers.includes(card.type)
      ? card.cards.filter((c) => this.checkActiveCard(c)).length > 0
      : this._hass && this._hass.states && this._hass.states[card.entity]?.state !== "off";
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

    if (this.show_head) {
      // ensure head appended
      try { toggleButton.appendChild(this.head); } catch(e) {}
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

  /* ---------- Core: styleCard + height management ---------- */

  async styleCard(isToggled) {
    // If opening, measure and animate to measured height; if closing animate to 0
    if (isToggled) {
      await this.updateCardHeight(true); // ensure children rendered, then measure
      // after measuring, set height to measured px so transition will animate
      const measured = this.cardList.scrollHeight;
      // set explicit pixel height to animate from 0 to measured
      this.cardList.style.height = measured + "px";

      // once expanded fully, switch to 'auto' to allow internal resizes without cutting
      const onTransitionEnd = (ev) => {
        if (ev.target !== this.cardList) return;
        this.cardList.removeEventListener("transitionend", onTransitionEnd);
        // set to auto so future content growth isn't clipped; keep height style removed so natural flow
        this.cardList.style.height = "auto";
      };
      // attach listener and guard in case transition doesn't run
      this.cardList.addEventListener("transitionend", onTransitionEnd);

      // send resize events and try to call child refresh methods
      this._postOpenRefresh();
    } else {
      // closing: if height is 'auto', we must set it to current pixel height first to allow transition
      const currentHeight = this.cardList.getBoundingClientRect().height;
      this.cardList.style.height = currentHeight + "px";
      // force reflow then set to 0 to animate
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      void this.cardList.offsetHeight; // reflow
      this.cardList.style.height = "0px";
      // also dispatch resize after a small delay
      setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
    }

    // Icon & text updates
    if (this.show_icon) {
      const openIcon = this.expand_upward ? "mdi:chevron-up" : "mdi:chevron-down";
      const closeIcon = this.expand_upward ? "mdi:chevron-down" : "mdi:chevron-up";
      try { this.icon.setAttribute("icon", isToggled ? closeIcon : openIcon); } catch(e){}
    }

    if (this._config.expand_text || this._config.collapse_text) {
      try {
        this.toggleButton.innerHTML = isToggled ? this._config.collapse_text : this._config.expand_text;
        if (this.show_icon) this.toggleButton.appendChild(this.icon);
      } catch(e){}
    }
  }

  // updateCardHeight: wait for child rendering, then set measured height (or animate)
  async updateCardHeight(waitForChildren = false) {
    // optionally wait for children's updateComplete promises
    if (waitForChildren) {
      await this._awaitChildrenRendered(600).catch(() => {}); // tolerate timeout
    }
    // measure and set height properly if currently opened
    if (this.isToggled) {
      const measured = this.cardList.scrollHeight;
      // if current height is 'auto' we temporarily set to measured to keep stable
      this.cardList.style.height = measured + "px";
      // after a short time set to auto so internal changes won't cut content
      setTimeout(() => {
        // only set to auto if still expanded
        if (this.isToggled) {
          this.cardList.style.height = "auto";
        }
      }, 350);
    } else {
      // closed -> ensure height 0
      this.cardList.style.height = "0px";
    }
  }

  // tries to await updateComplete of child elements with a timeout
  _awaitChildrenRendered(timeoutMs = 500) {
    const children = Array.from(this.cardList.children || []);
    const promises = children.map((el) => {
      if (el && el.updateComplete instanceof Promise) {
        return el.updateComplete.catch(() => {});
      }
      return Promise.resolve();
    });
    if (promises.length === 0) return Promise.resolve();
    return this._promiseWithTimeout(Promise.all(promises), timeoutMs);
  }

  _promiseWithTimeout(promise, ms) {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
    return Promise.race([promise, timeout]);
  }

  // call resize events and try to call common hooks on child cards
  _postOpenRefresh() {
    [0, 50, 250].forEach((t) => setTimeout(() => window.dispatchEvent(new Event("resize")), t));

    try {
      const children = Array.from(this.cardList.querySelectorAll("*"));
      children.forEach((el) => {
        if (el?.updateComplete instanceof Promise) {
          el.updateComplete.then(() => window.dispatchEvent(new Event("resize"))).catch(()=>{});
        }
        ["rebuild", "updateChart", "refresh", "recalculate", "renderChart", "redraw"].forEach((m) => {
          if (el && typeof el[m] === "function") {
            try { el[m](); } catch (e) {}
          }
        });
      });
    } catch (e) {}
  }

  /* ---------- Create card element helper ---------- */
  async createCardElement(cardConfig) {
    const createError = (error, origConfig) =>
      createThing("hui-error-card", {
        type: "error",
        error,
        origConfig,
      });

    const createThing = (tag, config) => {
      if (this.helpers) {
        if (config.type === "divider") return this.helpers.createRowElement(config);
        else return this.helpers.createCardElement(config);
      }
      const element = document.createElement(tag);
      try {
        element.setConfig(config);
      } catch (err) {
        console.error(tag, err);
        return createError(err.message, config);
      }
      return element;
    };

    let tag = cardConfig.type;
    if (tag.startsWith("divider")) tag = `hui-divider-row`;
    else if (tag.startsWith("custom:")) tag = tag.substr("custom:".length);
    else tag = `hui-${tag}-card`;

    const element = createThing(tag, cardConfig);
    element.hass = this._hass;
    element.addEventListener(
      "ll-rebuild",
      (ev) => {
        ev.stopPropagation();
        this.createCardElement(cardConfig).then(() => {
          this.renderCard();
        });
      },
      { once: true }
    );
    return element;
  }

  set hass(hass) {
    this._hass = hass;
    if (this._refCards) {
      this._refCards.forEach((card) => {
        try { card.hass = hass; } catch (e) {}
      });
    }
    if (this.head) {
      try { this.head.hass = hass; } catch (e) {}
    }
  }

  _computeCardSize(card) {
    if (typeof card.getCardSize === "function") return card.getCardSize();
    return customElements
      .whenDefined(card.localName)
      .then(() => this._computeCardSize(card))
      .catch(() => 1);
  }

  async getCardSize() {
    await this._cardSize.promise;
    const sizes = await Promise.all(this._refCards.map((c) => this._computeCardSize(c)));
    return sizes.reduce((a, b) => a + b, 0);
  }

  /* ---------- Observers: watch content changes to adapt height ---------- */
  setupObservers() {
    // cleanup old observers
    if (this._mutationObserver) {
      try { this._mutationObserver.disconnect(); } catch (e) {}
      this._mutationObserver = null;
    }
    if (this._resizeObserver) {
      try { this._resizeObserver.disconnect(); } catch (e) {}
      this._resizeObserver = null;
    }

    // MutationObserver to detect structural changes (cards added/removed)
    try {
      this._mutationObserver = new MutationObserver(() => {
        // when children change, if expanded, recalc height
        if (this.isToggled) {
          // wait a bit for new children to initialize
          setTimeout(() => this.updateCardHeight(true).catch(()=>{}), 80);
        }
      });
      this._mutationObserver.observe(this.cardList, { childList: true, subtree: true });
    } catch (e) {}

    // ResizeObserver if available: detect intrinsic size changes of children
    try {
      if (typeof ResizeObserver !== "undefined") {
        this._resizeObserver = new ResizeObserver(() => {
          if (this.isToggled) {
            // adapt height smoothly
            // if height currently 'auto' we temporarily set measured px value to avoid jumps
            const measured = this.cardList.scrollHeight;
            this.cardList.style.height = measured + "px";
            setTimeout(() => {
              if (this.isToggled) this.cardList.style.height = "auto";
            }, 300);
          }
        });
        // observe direct children (not entire subtree to limit noise)
        Array.from(this.cardList.children).forEach((c) => {
          try { this._resizeObserver.observe(c); } catch (e) {}
        });
      }
    } catch (e) {}
  }

  /* ---------- Utility: small helper to create CSS ---------- */
  getStyles() {
    return `
      .head-card-${this.id} {
        grid-column: 1;
        grid-row: 1;
      }

      .toggle-button-${this.id} {
        color: var(--primary-text-color);
        text-align: left;
        background: var(--card-background-color);
        border: none;
        margin-top: ${this.expand_upward && this.isToggled ? `0;` : `${this.card_margin};`}
        margin-bottom: ${!this.expand_upward && this.isToggled ? `0;` : `${this.card_margin};`}
        display: ${this.show_head ? "grid" : "flex"};
        justify-content: ${this.content_alignment};
        align-items: center;
        width: 100%;
        padding: ${this.button_padding};
        border-radius: var(--ha-card-border-radius, 4px);
        cursor: pointer;
        ${this.show_head ? "align-self: start;" : ""}
        ${this._config.buttonStyle || ""}
      }
      .toggle-button-${this.id}:focus {
        outline: none;
        background-color: var(--card-background-color);
      }

      .card-list-${this.id} {
        overflow: hidden;
        height: 0px;
        transition: height 0.32s ease;
        width: 100%;
        position: relative;
      }

      .toggle-button__icon-${this.id} {
        color: var(--paper-item-icon-color, #aaa);
      }

      .type-custom-collapsable-card {
        background: transparent;
      }
    `;
  }
}

try {
  customElements.define("collapsable-card", CollapsableCard);
} catch (e) {
  // if already defined (dev reload), ignore
  console.warn("collapsable-card already defined", e);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "collapsable-card",
  name: "Collapsable Card",
  preview: false,
  description: "The Collapsable Card allows you to hide other cards behind a dropdown toggle.",
});
