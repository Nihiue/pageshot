FROM node:12-alpine
MAINTAINER Wanglei<nihiue@gmail.com>

RUN npm install -g npm@6.10.0
#RUN npm config set disturl https://npm.taobao.org/dist --global
#RUN npm config set registry https://registry.npm.taobao.org --global
RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

WORKDIR /work
COPY fonts ./fonts
COPY package.json ./package.json

RUN npm install

COPY index.js ./index.js
ENTRYPOINT node index.js