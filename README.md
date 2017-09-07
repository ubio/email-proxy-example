# Email Proxy

This is an example of an Email Proxy which is build on top of the Haraka SMTP Email Server.

The Email Proxy can be used as complementary component to the ubio Automation Cloud. It lets you receive the emails from the supplier website we automate in order to analyse them before forwarding to your end user. This can be useful for detection of a successful purchase or during a user registration process.

## How it works

You own your user's data such as name: "John Doe", email: "john@doe.domain", phone, etc. and you want the Automation Cloud to purchase or book something for this user, so you need to provide some user data to make this transaction possible:
- an email address to use during purchase
- other data (billing address, delivery address, etc.)

The Automation Cloud uses the email address you provide when we automate the purchase or booking. The supplier website will send emails to this address. In some cases this is fine but in others, because some websites only confirm the transaction in the confirmation email, we would never know if it has completed successfully. So, if the user's original "john@doe.domain" address was provided then we would never get this confirmation – only the user will see it.

Some websites also require an email confirmation during registration. If you use the user's own email address we won't be able to complete the registration while we automate since any confirmation code will be sent to the user.

So, in place of the user's actual email address you should use an email address that you control. The Email Proxy allows you to do just that.

Here's how you proxy email from suppliers:

1. For a particular automation Job you generate a special email address for your user, e.g. "jd123456@mail.localhost" and provide this as the email address in your automation Job.
2. You run the Email Proxy on your server to receive emails for "jd123456@mail.localhost" when the supplier website sends them.
3. The Email Proxy can accept or reject email sent to "jd123456@mail.localhost". To make this decision it sends a POST request with "jd123456@mail.localhost" email address to your API, and expects your API to respond with {"exists": true} for expected email, or with {"exists": false} for something unexpected.
4. If an email is not rejected the Email Proxy receives email body.
5. The Email Proxy can then also forward this email to the user's original "john@doe.domain" address if required. To do this the Email Proxy sends the email body to your API and expects to get the user's real email address in response.

This is what we have in the end:

- an email for "jd123456@mail.localhost" or "complete@nonsense.localhost" which can be accepted or rejected
- an email for "jd123456@mail.localhost" forwarded to "john@doe.domain" if necessary
- the full body of each accepted email on your API, which can then retrieve a registration confirmation link or purchase confirmation number.

### How to run the Email Proxy

0. Clone the repository:

        git clone https://github.com/universalbasket/email-proxy-example.git email-proxy
        cd email-proxy

1. Adjust the configuration

    There are few things to configure:

    - `config/smtp.ini` - the Email Proxy is an SMTP server, we can choose an address and port it will listen on. Optional. The default port is 2525.
    - `config/smtp_forwarding` - The parameters of the SMTP server we are going to use for email forwarding.
    - `config/email_proxy` - The Email Proxy plugin parameters and API endpoint addresses.

2. Install dependencies

    You can install it locally:

        # you will need nodejs >=8.4.0 and node_modules
        brew install node
        npm install

        # or you can install it via docker
        docker build -t email-proxy .

3. Start Email Proxy

        # if you have nodejs
        npm start -s

        # if you prefer docker
        docker run -it --rm -p 2525:2525 email-proxy:latest

### API interface

1. The API endpoint specified as `api_check_email_url` in `config/email_proxy.ini` should expect a POST request with JSON which includes the `email` field with the recipient's email address:

```
POST http://localgost/check_email.json { "email": "jd123456@mail.localhost" }
```

In response your API should send JSON with an `exists` field:

```
{ "exists": true }
```

2. The API endpoint specified as `api_forward_params_url` in `config/email_proxy.ini` should expect a POST request with JSON which includes the `email` field with recipient email address and `eml` for the EML formatted body (MIME RFC 822):

```
POST http://localgost/forward_params.json { "email": "jd123456@mail.localhost", "eml": "Received: from .... test mailing\r\n\r\n" }
```

In response your API should send JSON with `forward`, `forwardTo`, and `from` fields:

```
{ "forward": true, "forwardTo": "john@doe.domain", "from": "notification@website.example.com" }
```

### How to debug

You can send email to the Email Proxy using [swaks SMTP test tool](https://www.jetmore.org/john/code/swaks/):

    brew install swaks
    swaks --helo website.example.com --to jd123456@mail.localhost --from notification@website.example.com --server localhost --port 2525

If you do not have your API set up yet and just want to try the Email Proxy you can prepare `check_email.json` and `forward_params.json` responses and serve them via any web server. Example for [devd](https://github.com/cortesi/devd):

    mkdir .tmp
    echo '{ "exists": true }' > .tmp/check_email.json
    echo '{ "forward": true, "forwardTo": "john@doe.domain", "from": "notification@website.example.org" }' > .tmp/forward_params.json

    brew install devd
    devd --port 8080 .tmp

For devd configuration above you need the following `config/email_proxy.ini`:

    api_check_email_url=http://localhost:8080/email_check.json
    api_forward_params_url=http://localhost:8080/forward_params.json

For the outgoing SMTP server during development you can try https://mailcatcher.me/ or https://mailtrap.io/ or just use a real one.

### How to change or adapt the code

To make changes to the Email Proxy code you should get familiar with [Haraka SMTP Email Server](http://haraka.github.io/) and it's [plugins](http://haraka.github.io/manual/Plugins.html) in particular. The entire Email Proxy example fits into one `plugins/email_proxy.js` file.
