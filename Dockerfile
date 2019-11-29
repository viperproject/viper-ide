FROM codercom/code-server:v2

USER root

RUN apt-get -y update && \
    apt-get -y install unzip openjdk-11-jre && \
    curl -# -o /tmp/viper.zip http://viper.ethz.ch/downloads/ViperToolsLinux-experimental.zip && \
    unzip /tmp/viper.zip -d /usr/local/Viper && \
    rm /tmp/viper.zip

USER coder
