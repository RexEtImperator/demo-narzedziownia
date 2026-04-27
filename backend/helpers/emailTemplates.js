const getBaseTemplate = (title, content) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
    .header { background-color: #f8f9fa; padding: 10px; text-align: center; border-bottom: 1px solid #ddd; }
    .content { padding: 20px 0; }
    .footer { font-size: 12px; color: #777; text-align: center; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
    .button { display: inline-block; padding: 10px 20px; background-color: #007bff; color: #fff; text-decoration: none; border-radius: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>${title}</h2>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>Wiadomość wygenerowana automatycznie przez equipr - System Zarządzania Narzędziownią.</p>
    </div>
  </div>
</body>
</html>
`;

const getWelcomeEmail = (username) => {
  const content = `
    <p>Witaj <strong>${username}</strong>,</p>
    <p>Witamy w equipr - Systemie Zarządzania Narzędziownią! Twoje konto zostało pomyślnie utworzone.</p>
    <p>Możesz się teraz zalogować i rozpocząć korzystanie z systemu.</p>
  `;
  return {
    subject: 'Witamy w equipr - Systemie Zarządzania Narzędziownią',
    html: getBaseTemplate('Witamy!', content)
  };
};

const getPasswordResetEmail = (resetLink) => {
  const content = `
    <p>Otrzymaliśmy prośbę o zresetowanie hasła.</p>
    <p>Kliknij przycisk poniżej, aby ustawić nowe hasło:</p>
    <p><a href="${resetLink}" class="button">Zresetuj hasło</a></p>
    <p>Jeśli to nie Ty wysłałeś(-aś) tę prośbę, zignoruj tę wiadomość.</p>
    <p>Link wygaśnie za 1 godzinę.</p>
  `;
  return {
    subject: 'Prośba o reset hasła',
    html: getBaseTemplate('Reset hasła', content)
  };
};

const getToolReturnRequestEmail = (toolName, employeeName, message) => {
  const content = `
    <p>Zgłoszono prośbę o zwrot narzędzia: <strong>${toolName}</strong>.</p>
    <p>Aktualnie przypisane do: <strong>${employeeName}</strong>.</p>
    ${message ? `<p>Wiadomość: ${message}</p>` : ''}
    <p>Prosimy o dopilnowanie, aby narzędzie zostało zwrócone możliwie szybko.</p>
  `;
  return {
    subject: `Prośba o zwrot: ${toolName}`,
    html: getBaseTemplate('Prośba o zwrot narzędzia', content)
  };
};

const getLowStockAlertEmail = (toolName, currentQuantity, minQuantity) => {
  const content = `
    <p>Stan magazynowy narzędzia <strong>${toolName}</strong> spadł poniżej minimalnego poziomu.</p>
    <ul>
      <li>Aktualna ilość: <strong>${currentQuantity}</strong></li>
      <li>Minimalna ilość: <strong>${minQuantity}</strong></li>
    </ul>
    <p>Prosimy o uzupełnienie stanu możliwie szybko.</p>
  `;
  return {
    subject: `Niski stan magazynowy: ${toolName}`,
    html: getBaseTemplate('Niski stan magazynowy', content)
  };
};

module.exports = {
  getWelcomeEmail,
  getPasswordResetEmail,
  getToolReturnRequestEmail,
  getLowStockAlertEmail
};
