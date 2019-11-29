FROM codercom/code-server:v2

USER root

RUN apt-get -y update && \
    apt-get -y install unzip openjdk-11-jre && \
    curl -# -o /tmp/viper.zip http://viper.ethz.ch/downloads/ViperToolsLinux-experimental.zip && \
    unzip /tmp/viper.zip -d /usr/local/Viper && \
    rm /tmp/viper.zip

RUN rm -f /etc/sudoers.d/nopasswd

USER coder

RUN wget -c https://marketplace.visualstudio.com/_apis/public/gallery/publishers/viper-admin/vsextensions/viper/latest/vspackage -O /tmp/server.vsix && \
    /usr/local/bin/code-server --install-extension /tmp/server.vsix && \
    rm -f /tmp/server.vsix
