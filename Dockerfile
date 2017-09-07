FROM node:8.4.0

WORKDIR /src
RUN chown node:node /src
USER node
COPY package* ./
RUN npm install --production
COPY . .

ENV CHECK_EMAIL_URL ''
ENV FWD_PARAMS_URL ''

EXPOSE 2525

CMD ["npm", "start", "-s"]
