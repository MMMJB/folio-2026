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

export function vibrate() {
  if ("vibrate" in window?.navigator) {
    window.navigator.vibrate(100);
  } else {
    hapticsLabel.click();
  }
}
