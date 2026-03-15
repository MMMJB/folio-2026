if (!window) throw new Error("Window is not defined");

if (!("vibrate" in window.navigator)) {
  const hapticsEl = document.createElement("input");
  hapticsEl.type = "checkbox";
  hapticsEl.id = "haptics-vibrate";
  hapticsEl.className = "hidden";
  hapticsEl.switch = true;

  const hapticsLabel = document.createElement("label");
  hapticsLabel.htmlFor = "haptics-vibrate";
  hapticsLabel.className = "hidden";

  document.body.appendChild(hapticsEl);
  document.body.appendChild(hapticsLabel);

  window.navigator.vibrate = () => hapticsLabel.click();
}
