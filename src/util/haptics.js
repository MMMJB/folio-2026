if (!window) throw new Error("Window is not defined");

if (!("vibrate" in window.navigator)) {
  const hapticsEl = document.createElement("input");
  hapticsEl.setAttribute("type", "checkbox");
  hapticsEl.setAttribute("id", "haptics-vibrate");
  hapticsEl.setAttribute("class", "hidden");
  hapticsEl.setAttribute("switch", "true");

  const hapticsLabel = document.createElement("label");
  hapticsLabel.setAttribute("for", "haptics-vibrate");
  hapticsLabel.setAttribute("class", "hidden");

  document.body.appendChild(hapticsEl);
  document.body.appendChild(hapticsLabel);

  window.navigator.vibrate = () => hapticsLabel.click();
}
