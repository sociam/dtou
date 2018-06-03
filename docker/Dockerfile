FROM ubuntu:14.04
MAINTAINER lmok

#
# - base layer
#
ENV HOME /opt
WORKDIR /opt

RUN apt-get update -qq
RUN apt-get install -y -qq git curl wget

# - install npm
RUN apt-get install -y -qq npm
RUN ln -s /usr/bin/nodejs /usr/bin/node

# - install bower
RUN npm install --global bower

#
# - DTOU layer (separate out the bower.json for speed)
#
RUN mkdir /opt/prism
COPY prism/bower.json /opt/prism/bower.json
RUN cd /opt/prism && bower install --allow-root
COPY prism /opt/prism