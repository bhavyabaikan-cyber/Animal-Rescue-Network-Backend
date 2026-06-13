// Request browser notification permission
export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.log("Browser does not support notifications");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return false;
}

// Show browser notification
export function showBrowserNotification(title, options = {}) {
  if (Notification.permission !== "granted") {
    return false;
  }

  const notification = new Notification(title, {
    body: options.body || "",
    icon: options.icon || "/favicon.ico",
    badge: "/favicon.ico",
    tag: options.tag || "rescuenet-notification",
    requireInteraction: false,
    ...options
  });

  notification.onclick = () => {
    window.focus();
    if (options.link) {
      window.location.href = options.link;
    }
    notification.close();
  };

  // Auto close after 5 seconds
  setTimeout(() => notification.close(), 5000);

  return true;
}

// Initialize push notifications
export async function initializePushNotifications() {
  const granted = await requestNotificationPermission();
  if (granted) {
    showBrowserNotification("RescueNet Notifications Enabled", {
      body: "You'll now receive real-time updates about rescue activities.",
      tag: "welcome"
    });
  }
  return granted;
}