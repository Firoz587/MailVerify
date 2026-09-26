# MailVerify

MailVerify helps you check email addresses before sending important messages. It gives you a quick, clear result so you can keep your lists cleaner and reduce avoidable delivery problems.

## Features

- Check one email address in seconds
- Review multiple addresses with a CSV upload
- See simple valid, invalid, and disposable results
- Export completed verification results as a clean CSV
- Browse the disposable email domain list
- Open the live API documentation from the app
- Free to use with no API key required

## Use MailVerify

Open the app and choose **Single Check** to verify one address. For a list, choose **Bulk Verify**, upload a CSV or TXT file with one email address per line, and download the results when processing is complete.

The app is also available at these pages after deployment:

- `/` - Email verification dashboard
- `/disposable` - Disposable email domain list
- `/api/docs` - Interactive API documentation

## Run locally

```powershell
npm install
npm run dev
```

The dashboard opens on `http://127.0.0.1:8443/`.

## Deploy with Vercel

1. Push this repository to GitHub.
2. Import the repository in Vercel.
3. Use `npm install` for the install command.
4. Use `npm run vercel-build` for the build command.
5. Set the output directory to `dist`.
6. Deploy.

After deployment, test the dashboard, the Disposable List page, and the API Docs link from the navigation bar.

## CSV format

Use a `.csv` or `.txt` file with one email address per line. UTF-8, UTF-16, and common Windows CSV exports are supported. A first row named `email` is ignored automatically.

```text
email
hello@example.com
team@example.org
```

## License

Free and open source for personal and commercial projects.
